import { FastifyPluginAsync } from 'fastify'
import { RouteOptimizerService } from '../services/TravelOptimizerService'

const routeRoutes: FastifyPluginAsync = async (fastify) => {
  const routeOptimizer = new RouteOptimizerService(fastify.prisma)

  // Générer un trajet optimisé
  fastify.post('/optimize', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['segmentIds', 'startPoint', 'profile', 'goBack'],
        properties: {
          segmentIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 10 // Limiter pour éviter les abus
          },
          startPoint: {
            type: 'object',
            required: ['latitude', 'longitude'],
            properties: {
              latitude: { type: 'number', minimum: -90, maximum: 90 },
              longitude: { type: 'number', minimum: -180, maximum: 180 },
              name: { type: 'string' }
                },
            },
            profile: {
                type: 'string', 
                enum: ['bike', 'foot', 'moutainbike']
            },
            goBack: {type: 'boolean'},
            routeName: { type: 'string', maxLength: 100 }
        }
      }
    }
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { segmentIds, startPoint, routeName, profile, goBack } = request.body as {
      segmentIds: string[]
      startPoint: { latitude: number, longitude: number, name?: string }
      routeName?: string
      profile: string,
      goBack: boolean,
    }

    try {
      const result = await routeOptimizer.generateKomHuntRoute(userId, {
        segmentIds,
        startPoint,
        routeName,
        profile,
        goBack
      })

      return {
        success: true,
        message: `Route optimized with ${segmentIds.length} segments`,
        data: {
          routeId: result.routeId,
          totalDistance: Math.round(result.route.totalDistance),
          totalDuration: Math.round(result.route.totalDuration),
          segments: result.segments,
          waypoints: result.route.waypoints
        }
      }
    } catch (error) {
      fastify.log.error(error)
      return reply.status(400).send({
        error: 'Failed to optimize route',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  // Récupérer les routes de l'utilisateur
  fastify.get('/my-routes', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  }, async (request) => {
    const { userId } = request.user as { userId: string }
    
    const routes = await routeOptimizer.getUserRoutes(userId)
    
    return {
      success: true,
      routes: routes.map((route: { id: any; name: any; totalDistance: any; estimatedTime: any; segments: string | any[]; createdAt: any }) => ({
        id: route.id,
        name: route.name,
        totalDistance: route.totalDistance,
        totalDuration: route.estimatedTime,
        segmentCount: route.segments.length,
        createdAt: route.createdAt
      }))
    }
  })

  // Récupérer une route spécifique
  fastify.get('/:routeId', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { routeId } = request.params as { routeId: string }

    try {
      const route = await routeOptimizer.getRoute(routeId, userId)
      
      return {
        success: true,
        route: {
          id: route.id,
          name: route.name,
          totalDistance: route.totalDistance,
          totalDuration: route.estimatedTime,
          startPoint: {
            latitude: route.startLatitude,
            longitude: route.startLongitude
          },
          segments: route.segments.map((rs: { order: any; segment: { id: any; name: any; distance: any; komTime: any; startLatitude: any; startLongitude: any } }) => ({
            order: rs.order,
            segment: {
              id: rs.segment.id,
              name: rs.segment.name,
              distance: rs.segment.distance,
              komTime: rs.segment.komTime,
              startPoint: {
                latitude: rs.segment.startLatitude,
                longitude: rs.segment.startLongitude
              }
            }
          })),
          createdAt: route.createdAt
        }
      }
    } catch (error) {
      return reply.status(404).send({
        error: 'Route not found'
      })
    }
  })

  // export
  fastify.get('/:routeId/export/:format', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        return reply.status(401).send({ error: 'Unauthorized' })
      }
    }
  }, async (request, reply) => {
    const { userId } = request.user as { userId: string }
    const { routeId, format } = request.params as { routeId: string, format: 'gpx' | 'json' | 'tcx' }

    if (!['gpx', 'json', 'tcx'].includes(format)) {
      return reply.status(400).send({
        error: 'Invalid format. Supported: gpx, json, tcx'
      })
    }

    try {
      const exported = await routeOptimizer.exportRoute(routeId, userId, format)
      
      reply.header('Content-Type', exported.mimeType)
      reply.header('Content-Disposition', `attachment; filename="${exported.filename}"`)
      
      return exported.content
    } catch (error) {
      fastify.log.error(error)
      return reply.status(404).send({
        error: 'Route not found or export failed'
      })
    }
  })
}

export default routeRoutes