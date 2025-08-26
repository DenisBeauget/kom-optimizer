import { FastifyPluginAsync } from 'fastify'
import axios from 'axios'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Mobile auth URL 
  fastify.get('/strava/mobile-auth-url', async (request, reply) => {
    const { redirectUri } = request.query as { redirectUri?: string }

    if (!redirectUri) {
      return reply.status(400).send({ error: 'Missing redirectUri' })
    }

    const state = encodeURIComponent(JSON.stringify({ redirectUri }))

    const stravaMobileAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${
      process.env.STRAVA_CLIENT_ID
    }&response_type=code&redirect_uri=${encodeURIComponent(
      process.env.STRAVA_REDIRECT_URI!
    )}&approval_prompt=force&scope=read,activity:read_all&state=${state}`

    return { authUrl: stravaMobileAuthUrl }
  })

  // Classic web flow
  fastify.get('/strava', async (request, reply) => {
    const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&approval_prompt=force&scope=read,activity:read_all`
    return reply.redirect(stravaAuthUrl)
  })

  // Callback
  fastify.get('/strava/callback', async (request, reply) => {
    const { code, error, state } = request.query as {
      code?: string
      error?: string
      state?: string
    }

    let redirectUri: string | null = null
    if (state) {
      try {
        const parsed = JSON.parse(decodeURIComponent(state))
        redirectUri = parsed.redirectUri
      } catch (e: any) {
        fastify.log.error('Failed to parse state', e)
      }
    }

    if (error) {
      if (redirectUri) {
        return reply.redirect(`${redirectUri}?error=authorization_denied`)
      }
      return reply.status(400).send({ error: 'Strava authorization denied' })
    }

    if (!code) {
      if (redirectUri) {
        return reply.redirect(`${redirectUri}?error=no_code`)
      }
      return reply.status(400).send({ error: 'No authorization code received' })
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code'
      })

      const { access_token, refresh_token, expires_at, athlete } = tokenResponse.data

      // Upsert user
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

      // Upsert token
      await fastify.prisma.stravaToken.upsert({
        where: { userId: user.id },
        update: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: new Date(expires_at * 1000),
          scope: 'read,activity:read_all'
        },
        create: {
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

      // Redirect mobile if redirectUri known
      if (redirectUri) {
        const deepLink = `${redirectUri}?token=${jwtToken}&success=true&user=${encodeURIComponent(
          JSON.stringify({
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
            avatar: user.avatar
          })
        )}`
        return reply.redirect(deepLink)
      }

      // web
      return {
        success: true,
        message: 'Successfully authenticated with Strava',
        user: {
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar
        },
        token: jwtToken
      }
    } catch (err: any) {
      fastify.log.error('Strava callback error:', err)

      if (redirectUri) {
        return reply.redirect(`${redirectUri}?error=token_exchange_failed`)
      }

      return reply.status(500).send({
        error: 'Failed to exchange authorization code',
        details: process.env.NODE_ENV === 'development' ? err : undefined
      })
    }
  })

  // Refresh token endpoint
  fastify.post('/strava/refresh-token', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify()
      } catch (err) {
        reply.send(err)
      }
    }
  }, async (request, reply) => {
    const { userId } = request.user as any

    try {
      const stravaToken = await fastify.prisma.stravaToken.findUnique({
        where: { userId: userId }
      })

      if (!stravaToken || !stravaToken.refreshToken) {
        return reply.status(401).send({ 
          error: 'No refresh token available. Please re-authenticate.',
          requiresAuth: true 
        })
      }

      const tokenResponse = await axios.post('https://www.strava.com/oauth/token', {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: stravaToken.refreshToken,
        grant_type: 'refresh_token'
      })

      const { access_token, refresh_token, expires_at } = tokenResponse.data

      await fastify.prisma.stravaToken.update({
        where: { userId: userId },
        data: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: new Date(expires_at * 1000)
        }
      })

      return {
        success: true,
        message: 'Token refreshed successfully'
      }

    } catch (error: any) {
      fastify.log.error('Token refresh error:', error)
      return reply.status(500).send({ 
        error: 'Failed to refresh token',
        requiresAuth: true 
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