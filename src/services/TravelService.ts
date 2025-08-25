import axios from 'axios'
import polyline from '@mapbox/polyline'
import { Point, RouteSegment, OptimizedRoute, KomSegment, OptimizeOptions } from '../types/routing'

export class RoutingService {
  private apiKey: string
  private baseUrl = 'https://graphhopper.com/api/1'

  constructor() {
    this.apiKey = process.env.GRAPHHOPPER_API_KEY || ''
  }


  private calculateDistance(a: Point, b: Point): number {
    const R = 6371000
    const dLat = this.toRad(b.latitude - a.latitude)
    const dLon = this.toRad(b.longitude - a.longitude)
    const lat1 = this.toRad(a.latitude)
    const lat2 = this.toRad(b.latitude)
    const sa = Math.sin(dLat / 2)
    const sb = Math.sin(dLon / 2)
    const c = 2 * Math.atan2(
      Math.sqrt(sa * sa + Math.cos(lat1) * Math.cos(lat2) * sb * sb),
      Math.sqrt(1 - (sa * sa + Math.cos(lat1) * Math.cos(lat2) * sb * sb))
    )
    return R * c
  }
  private toRad(d: number) { return d * (Math.PI / 180) }

  // k_nn
  private optimizeSegmentOrder(startPoint: Point, segments: KomSegment[]): KomSegment[] {
    if (segments.length <= 1) return segments.slice()
    const optimized: KomSegment[] = []
    const remaining = [...segments]
    let current = startPoint

    while (remaining.length > 0) {
      let bestIdx = 0
      let bestCost = Infinity
      for (let i = 0; i < remaining.length; i++) {
        const s = remaining[i]
        const toStart = this.calculateDistance(current, s.startPoint)
        const segLen = this.calculateDistance(s.startPoint, s.endPoint)
        const cost = toStart + segLen
        if (cost < bestCost) { bestCost = cost; bestIdx = i }
      }
      const chosen = remaining.splice(bestIdx, 1)[0]
      optimized.push(chosen)
      current = chosen.endPoint
    }
    return optimized
  }

  // GraphHopper 
  private async calculateRoute(
    from: Point,
    to: Point,
    segmentName: string | undefined,
    opts: OptimizeOptions
  ): Promise<RouteSegment> {
    const profile = opts.profile ?? 'bike'
    const locale = opts.locale ?? 'fr'
    const elevation = opts.elevation ?? false
    const pointsEncoded = opts.pointsEncoded ?? false

    try {
      const params = new URLSearchParams()
      params.append('point', `${from.latitude},${from.longitude}`)
      params.append('point', `${to.latitude},${to.longitude}`)
      params.append('profile', profile)
      params.append('locale', locale)
      params.append('key', this.apiKey)
      params.append('points_encoded', String(pointsEncoded))
      params.append('elevation', String(elevation))
      params.append('instructions', 'false')

      const url = `${this.baseUrl}/route?${params.toString()}`
      const response = await axios.get(url, { timeout: 20000 })

      if (!response.data.paths?.length) {
        throw new Error(`No route found between ${from.name || 'A'} and ${to.name || 'B'}`)
      }

      const path = response.data.paths[0]

      let decoded: Point[] = []
      const pts = path.points
      if (!pointsEncoded) {
        const coords: Array<[number, number] | [number, number, number]> = pts.coordinates
        decoded = coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))
      } else {
        const encoded: string = typeof pts === 'string' ? pts : pts.points
        decoded = polyline.decode(encoded).map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
      }

      return {
        distance: path.distance,
        duration: path.time / 1000,
        geometry: decoded,
        segmentName
      }
    } catch (e) {
      console.error('GraphHopper API error', e)
      throw e;
    }
  }

// Optimisation KOM 
async optimizeKomRoute(
    startPoint: Point,
    profile: string,
    goBack: boolean,
    segments: Array<{
      startPoint: Point
      endPoint: Point
      name: string
      id: string
      polyline?: string
      distance: number
    }>,
    options: OptimizeOptions = {}
  ): Promise<OptimizedRoute> {
  
    const opts: OptimizeOptions = {
      profile: profile ?? 'bike',
      locale: options.locale ?? 'fr',
      elevation: options.elevation ?? false,
      pointsEncoded: options.pointsEncoded ?? false,
      returnToStart: goBack ?? false,
      komEffortSpeedKph: options.komEffortSpeedKph ?? 30,
      approachThresholdMeters: options.approachThresholdMeters ?? 50
    }
  

    const ordered = this.optimizeSegmentOrder(
      startPoint,
      segments.map(s => ({
        startPoint: s.startPoint,
        endPoint: s.endPoint,
        name: s.name,
        id: s.id,
        polyline: s.polyline,
        distance: s.distance
      }))
    )
  
   
    const routeSegments: RouteSegment[] = []
    const waypoints: Point[] = [startPoint]
    const fullGeometry: Point[] = [startPoint]
    let totalDistance = 0
    let totalDuration = 0
    let current = startPoint
  
    for (const kom of ordered) {
      const distToStart = this.calculateDistance(current, kom.startPoint)
      if (distToStart > (opts.approachThresholdMeters as number)) {
        const leg = await this.calculateRoute(current, kom.startPoint, `To ${kom.name}`, opts)
        routeSegments.push(leg)
        totalDistance += leg.distance
        totalDuration += leg.duration
        fullGeometry.push(...leg.geometry.slice(1))
        waypoints.push(kom.startPoint)
      }
  
      // Strava priority
      let segGeom: Point[]
      let segDuration: number
      console.log("POLY : ", kom.polyline)
      if (kom.polyline) {
        const pts = polyline.decode(kom.polyline).map(([lat, lng]) => ({ latitude: lat, longitude: lng }))
        segGeom = pts
  
        const speedMs = (opts.komEffortSpeedKph as number) * 1000 / 3600
        segDuration = kom.distance / speedMs
      } else {
        // fallback GraphHopper ()
        const leg = await this.calculateRoute(kom.startPoint, kom.endPoint, `KOM: ${kom.name}`, opts)
        segGeom = leg.geometry
        segDuration = leg.duration
      }
  
      routeSegments.push({
        distance: kom.distance,
        duration: segDuration,
        geometry: segGeom,
        segmentName: `KOM: ${kom.name}`
      })
  
      totalDistance += kom.distance
      totalDuration += segDuration
      fullGeometry.push(...segGeom.slice(1))
      waypoints.push(kom.endPoint)
      current = kom.endPoint
    }
  

    if (opts.returnToStart) {
      const back = await this.calculateRoute(current, startPoint, 'Return to start', opts)
      routeSegments.push(back)
      totalDistance += back.distance
      totalDuration += back.duration
      fullGeometry.push(...back.geometry.slice(1))
      waypoints.push(startPoint)
    }
  
    return {
      totalDistance,
      totalDuration,
      segments: routeSegments,
      waypoints,
      fullGeometry,
      segmentOrder: ordered.map(s => s.id),
      segmentNameOrder: ordered.map(s => s.name)
    }
  }

  // GPX complet
  generateGPX(route: OptimizedRoute, routeName = 'KOM Hunt'): string {
    const waypointEls = route.waypoints.slice(1).map((p, i) => {
      const name = p.name || `WP ${i + 1}`
      return `  <wpt lat="${p.latitude}" lon="${p.longitude}">
    <name>${name}</name>
    <type>KOM</type>
  </wpt>`
    }).join('\n')

    const trkpts = route.fullGeometry
      .map(p => `<trkpt lat="${p.latitude.toFixed(6)}" lon="${p.longitude.toFixed(6)}"></trkpt>`)
      .join('\n      ')

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Strava KOM Optimizer" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${routeName}</name>
    <desc>Optimized route for KOM hunting - Total: ${(route.totalDistance/1000).toFixed(1)}km, ${Math.round(route.totalDuration/60)}min</desc>
  </metadata>

${waypointEls}

  <trk>
    <name>${routeName}</name>
    <type>cycling</type>
    <trkseg>
      ${trkpts}
    </trkseg>
  </trk>
</gpx>`
  }
}
