export interface Point {
    latitude: number
    longitude: number
    name?: string
  }
  
  export interface RouteSegment {
    distance: number 
    duration: number 
    geometry: Point[] 
    segmentName?: string 
  }
  
  export interface OptimizedRoute {
    totalDistance: number
    totalDuration: number
    segments: RouteSegment[]
    waypoints: Point[] 
    fullGeometry: Point[] 
    segmentOrder: string[] 
    segmentNameOrder?: string[]
  }
  
  export interface KomSegment {
    startPoint: Point
    endPoint: Point
    name: string
    id: string           
    polyline?: string   
    distance: number    
  }
  
  
  export interface OptimizeOptions {
    profile?: string 
    locale?: string                   // défaut: 'fr'
    elevation?: boolean               // défaut: false
    pointsEncoded?: boolean           // défaut: false 
    returnToStart?: boolean           // défaut: false
    komEffortSpeedKph?: number        // défaut: 30
    approachThresholdMeters?: number  // défaut: 50
  }

  
export interface KomHuntRequest {
  segmentIds: string[] // IDs Strava 
  startPoint: Point
  routeName?: string
  profile: string, 
  goBack: boolean,
  routing?: OptimizeOptions
}

export interface KomHuntResponse {
  route: OptimizedRoute
  segments: Array<{
    id: string
    name: string
    distance: number
    komTime: number | null
    startPoint: Point
  }>
  routeId: string
}
