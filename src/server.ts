import Fastify from 'fastify'
import { PrismaClient } from '@prisma/client'
import cors from '@fastify/cors'
import jwt from '@fastify/jwt'
import oauth2 from '@fastify/oauth2'

// Routes
import authRoutes from './routes/auth'
import userRoutes from './routes/user'
import routeRoutes from './routes/route'

const prisma = new PrismaClient()

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
})


fastify.decorate('prisma', prisma)


declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

const start = async () => {
  try {
    // JWT
    await fastify.register(jwt, {
      secret: process.env.JWT_SECRET || 'fallback-secret-change-in-prod'
    })

    // OAuth2 Strava
    await fastify.register(oauth2, {
      name: 'strava',
      scope: ['read,activity:read_all'],
      credentials: {
        client: {
          id: process.env.STRAVA_CLIENT_ID!,
          secret: process.env.STRAVA_CLIENT_SECRET!
        },
        auth: {
            authorizeHost: 'https://www.strava.com',
            authorizePath: '/oauth/authorize',
            tokenHost: 'https://www.strava.com',
            tokenPath: '/oauth/token'
          }
      },
      startRedirectPath: '/auth/strava',
      callbackUri: process.env.STRAVA_REDIRECT_URI!
    })

    // Routes
    await fastify.register(authRoutes, { prefix: '/api/auth' })
    await fastify.register(userRoutes, {prefix: '/api/user' })
    await fastify.register(routeRoutes, { prefix: '/api/route' })

    // Health check
    fastify.get('/health', async () => {
      return { 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        version: '1.0.0'
      }
    })


    const port = parseInt(process.env.PORT || '3000')
    await fastify.listen({ port, host: '0.0.0.0' })
    
    console.log(`Server running on http://localhost:${port}`)

    
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}


const gracefulShutdown = async () => {
  try {
    await fastify.close()
    await prisma.$disconnect()
    console.log('Server stopped')
    process.exit(0)
  } catch (err) {
    console.error('Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

start()