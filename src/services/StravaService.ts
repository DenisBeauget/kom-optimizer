import axios, { AxiosInstance } from 'axios'
import { PrismaClient } from '@prisma/client'

export interface StravaSegment {
  id: number
  name: string
  distance: number
  average_grade: number
  maximum_grade: number
  elevation_high: number
  elevation_low: number
  start_latlng: [number, number]
  end_latlng: [number, number]

  map?: {
    id: string,
    polyline: string
  }

  xoms?: {
    kom: string
    qom: string
    overall: string
    destination: {
      href: string
      type: string
      name: string
    }
  }

  local_legend?: {
    athlete_id: number
    title: string
    profile: string
    effort_description: string
    effort_count: string
    effort_counts: {
      overall: string
      female: string
    }
    destination: string
  }
}

export interface StravaSegmentEffort {
  id: number
  elapsed_time: number
  athlete: {
    id: number
    firstname: string
    lastname: string
  }
}

export class StravaService {
  private client: AxiosInstance
  private prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
    this.client = axios.create({
      baseURL: 'https://www.strava.com/api/v3',
      timeout: 10000
    })
  }

  private async getValidToken(userId: string): Promise<string> {
    const tokenRecord = await this.prisma.stravaToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' }
    })

    if (!tokenRecord) {
      throw new Error('No Strava token found for user')
    }

    
    if (new Date() >= tokenRecord.expiresAt) {
      return await this.refreshToken(tokenRecord.refreshToken, userId)
    }

    return tokenRecord.accessToken
  }

  private async refreshToken(refreshToken: string, userId: string): Promise<string> {
    try {
      const response = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })

      const { access_token, refresh_token, expires_at } = response.data


      await this.prisma.stravaToken.create({
        data: {
          userId,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: new Date(expires_at * 1000),
          scope: 'read,activity:read_all'
        }
      })

      return access_token
    } catch (error) {
      throw new Error('Failed to refresh Strava token')
    }
  }


  async getStarredSegments(userId: string): Promise<StravaSegment[]> {
    const token = await this.getValidToken(userId)
    
    try {
      const response = await this.client.get('/segments/starred', {
        headers: { Authorization: `Bearer ${token}` }
      })

      return response.data
    } catch (error) {
      console.error('Error fetching starred segments:', error)
      throw new Error('Failed to fetch starred segments from Strava')
    }
  }


  async getSegmentDetails(segmentId: number, userId: string): Promise<StravaSegment> {
    const token = await this.getValidToken(userId)
    
    try {
      const response = await this.client.get(`/segments/${segmentId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })

      return response.data
    } catch (error) {
      console.error('Error fetching segment details:', error)
      throw new Error('Failed to fetch segment details from Strava')
    }
  }


  async syncStarredSegments(userId: string): Promise<void> {
    const segments = await this.getStarredSegments(userId)
    
    for (const segment of segments) {

      // KOM + Polyline in details
      const segmentDetails = await this.getSegmentDetails(segment.id, userId);
      
      await this.prisma.starredSegment.upsert({
        where: { stravaSegmentId: segment.id },
        update: {
          name: segment.name,
          distance: segment.distance,
          averageGrade: segment.average_grade,
          maximumGrade: segment.maximum_grade,
          elevationHigh: segment.elevation_high,
          elevationLow: segment.elevation_low,
          startLatitude: segment.start_latlng[0],
          startLongitude: segment.start_latlng[1],
          endLatitude: segment.end_latlng[0],
          endLongitude: segment.end_latlng[1],
          komTime: timeStringToSeconds(segmentDetails.xoms?.kom),
          komAthleteId: segmentDetails.local_legend?.athlete_id,
          lastUpdated: new Date(),
          polyline: segmentDetails.map?.polyline
        },
        create: {
          stravaSegmentId: segment.id,
          name: segment.name,
          distance: segment.distance,
          averageGrade: segment.average_grade,
          maximumGrade: segment.maximum_grade,
          elevationHigh: segment.elevation_high,
          elevationLow: segment.elevation_low,
          startLatitude: segment.start_latlng[0],
          startLongitude: segment.start_latlng[1],
          endLatitude: segment.end_latlng[0],
          endLongitude: segment.end_latlng[1],
          komTime: timeStringToSeconds(segmentDetails.xoms?.kom),
          komAthleteId: segmentDetails.local_legend?.athlete_id,
          polyline: segmentDetails.map?.polyline
        }
      })
    }
  }
}

function timeStringToSeconds(time: any): number {
    const [minutes, seconds] = time.split(':').map(Number)
    return minutes * 60 + seconds
  }