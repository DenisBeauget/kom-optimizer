import { FastifyPluginAsync } from 'fastify'
import { StravaService } from '../services/StravaService'
import { PrismaClient } from '@prisma/client'



const userRoutes: FastifyPluginAsync = async (fastify) => {
    const stravaService = new StravaService(new PrismaClient());

    fastify.get('/segments/starred', {
        preHandler: async (request, reply) => {
          try {
            await request.jwtVerify()
          } catch (err) {
            return reply.status(401).send({ error: 'Unauthorized' })
          }
        }
      }, async (request) => {
        const { userId } = request.user as { userId: string }
        const segments = await stravaService.getStarredSegments(userId)
        await stravaService.syncStarredSegments(userId);
        return { success: true, segments }
      })

      fastify.get('/segment/:id', {
        preHandler: async (request, reply) => {
          try {
            await request.jwtVerify()
          } catch (err) {
            return reply.status(401).send({ error: 'Unauthorized' })
          }
        }
      }, async (request) => {
        const { id } = request.params as { id: number }
        const { userId } = request.user as { userId: string }
        const segment = await stravaService.getSegmentDetails(id, userId)
        return { success: true, segment }
      })
      
  };


export default userRoutes  