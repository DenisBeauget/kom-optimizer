import { PrismaClient } from '@prisma/client'
import { RoutingService} from './TravelService'
import { Point, KomHuntRequest, KomHuntResponse } from '../types/routing'



export class RouteOptimizerService {
  private prisma: PrismaClient
  private routingService: RoutingService

  constructor(prisma: PrismaClient) {
    this.prisma = prisma
    this.routingService = new RoutingService()
  }

  async generateKomHuntRoute(
    userId: string,
    request: KomHuntRequest
  ): Promise<KomHuntResponse> {


    const segments = await this.prisma.starredSegment.findMany({
      where: {
        stravaSegmentId: { in: request.segmentIds.map(id => parseInt(id, 10)) }
      }
    })

    if (segments.length === 0) throw new Error('No segments found')
    if (segments.length !== request.segmentIds.length) throw new Error('Some segments not found')

    
    const segmentData = segments.map(segment => ({
      startPoint: {
        latitude: segment.startLatitude,
        longitude: segment.startLongitude,
        name: `${segment.name} - Start`
      } as Point,
      endPoint: {
        latitude: segment.endLatitude,
        longitude: segment.endLongitude,
        name: `${segment.name} - Finish`
      } as Point,
      name: segment.name,
      id: String(segment.id),
      polyline: segment.polyline || undefined,
      distance: segment.distance
    }))

   
    const optimizedRoute = await this.routingService.optimizeKomRoute(
      request.startPoint,
    request.profile,
    request.goBack,
      segmentData,
      {
        locale: request.routing?.locale ?? 'fr',
        elevation: request.routing?.elevation ?? false,
        pointsEncoded: request.routing?.pointsEncoded ?? false,
        returnToStart: request.routing?.returnToStart ?? false,
        komEffortSpeedKph: request.routing?.komEffortSpeedKph ?? 30,
        approachThresholdMeters: request.routing?.approachThresholdMeters ?? 50,
      }
    )


    const routeName = request.routeName || `KOM Hunt - ${new Date().toLocaleDateString('fr-FR')}`

    const savedRoute = await this.prisma.optimizedRoute.create({
      data: {
        userId,
        name: routeName,
        totalDistance: optimizedRoute.totalDistance,
        totalElevation: 0,
        estimatedTime: optimizedRoute.totalDuration,
        startLatitude: request.startPoint.latitude,
        startLongitude: request.startPoint.longitude,
        gpxData: this.routingService.generateGPX(optimizedRoute, routeName)
      }
    })


    for (let i = 0; i < optimizedRoute.segmentOrder.length; i++) {
      const segId = optimizedRoute.segmentOrder[i]
      await this.prisma.routeSegment.create({
        data: { routeId: savedRoute.id, segmentId: segId, order: i + 1 }
      })
    }

   
    const segById = new Map(segments.map(s => [String(s.id), s]))
    const segmentDetails = optimizedRoute.segmentOrder.map(id => {
      const segment = segById.get(id)!
      return {
        id: String(segment.id),
        name: segment.name,
        distance: segment.distance,
        komTime: segment.komTime ?? null,
        startPoint: { latitude: segment.startLatitude, longitude: segment.startLongitude }
      }
    })

    return { route: optimizedRoute, segments: segmentDetails, routeId: savedRoute.id }
  }

 
  async getUserRoutes(userId: string) {
    return this.prisma.optimizedRoute.findMany({
      where: { userId },
      include: {
        segments: { include: { segment: true }, orderBy: { order: 'asc' } }
      },
      orderBy: { createdAt: 'desc' }
    })
  }


  async getRoute(routeId: string, userId: string) {
    const route = await this.prisma.optimizedRoute.findFirst({
      where: { id: routeId, userId },
      include: {
        segments: { include: { segment: true }, orderBy: { order: 'asc' } }
      }
    })
    if (!route) throw new Error('Route not found')
    return route
  }

 
  async exportRoute(routeId: string, userId: string, format: 'gpx' | 'json' | 'tcx') {
    const route = await this.getRoute(routeId, userId)
    switch (format) {
      case 'gpx':
        return {
          content: route.gpxData,
          mimeType: 'application/gpx+xml',
          filename: `${route.name.replace(/[^a-zA-Z0-9]/g, '_')}.gpx`
        }
      case 'json':
        return {
          content: JSON.stringify(route, null, 2),
          mimeType: 'application/json',
          filename: `${route.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`
        }
      case 'tcx':
        throw new Error('TCX format not implemented yet')
      default:
        throw new Error('Unsupported format')
    }
  }
}
