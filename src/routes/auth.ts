import { FastifyPluginAsync } from 'fastify'
import axios from 'axios'

const authRoutes: FastifyPluginAsync = async (fastify) => {

    
    fastify.get('/strava', async (request, reply) => {
    const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&approval_prompt=force&scope=read,activity:read_all`
    
    return reply.redirect(stravaAuthUrl)
  })


  fastify.get('/strava/callback', async (request, reply) => {
    const { code, error } = request.query as { code?: string, error?: string }

    if (error) {
      return reply.status(400).send({ error: 'Strava authorization denied' })
    }

    if (!code) {
      return reply.status(400).send({ error: 'No authorization code received' })
    }

    try {
      const tokenResponse = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: 'authorization_code'
      })

      const { 
        access_token, 
        refresh_token, 
        expires_at, 
        athlete 
      } = tokenResponse.data

      const user = await fastify.prisma.user.upsert({
        where: { stravaId: athlete.id },
        update: {
          username: athlete.username,
          email: athlete.email || `${athlete.username}@strava.local`,
          firstName: athlete.firstname,
          lastName: athlete.lastname,
          avatar: athlete.profile
        },
        create: {
          stravaId: athlete.id,
          username: athlete.username,
          email: athlete.email || `${athlete.username}@strava.local`,
          firstName: athlete.firstname,
          lastName: athlete.lastname,
          avatar: athlete.profile
        }
      })

      await fastify.prisma.stravaToken.create({
        data: {
          userId: user.id,
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: new Date(expires_at * 1000),
          scope: 'read,activity:read_all'
        }
      })


      const jwtToken = fastify.jwt.sign({ 
        userId: user.id,
        stravaId: athlete.id 
      })

      return {
        success: true,
        message: 'Successfully authenticated with Strava',
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName
        },
        token: jwtToken
      }

    } catch (error) {
      fastify.log.error(error)
      return reply.status(500).send({ 
        error: 'Failed to exchange authorization code',
        details: process.env.NODE_ENV === 'development' ? error : undefined
      })
    }
  })

  // auth test
  fastify.get('/test', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.send(err)
      }
    }
  }, async (request) => {
    return { 
      message: 'JWT Authentication working!',
      user: request.user 
    }
  })
}

export default authRoutes