import { FastifyPluginAsync } from 'fastify'
import axios from 'axios'

const authRoutes: FastifyPluginAsync = async (fastify) => {


    // Mobile
   fastify.get('/strava/mobile-auth-url', async (request, reply) => {
    const stravaMobileAuthUrl = `https://www.strava.com/oauth/mobile/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&approval_prompt=force&scope=read,activity:read_all`
    
    return {
      authUrl: stravaMobileAuthUrl
    }
  })

    // Classic
    fastify.get('/strava', async (request, reply) => {
    const stravaAuthUrl = `https://www.strava.com/oauth/authorize?client_id=${process.env.STRAVA_CLIENT_ID}&response_type=code&redirect_uri=${process.env.STRAVA_REDIRECT_URI}&approval_prompt=force&scope=read,activity:read_all`
    
    return reply.redirect(stravaAuthUrl)
  })


 fastify.get('/strava/callback', async (request, reply) => {
    const { code, error } = request.query as { code?: string, error?: string }

    // Détection si c'est un appel mobile ou web
    const userAgent = request.headers['user-agent'] || ''
    const isMobileApp = userAgent.includes('Expo') || userAgent.includes('ReactNative') || 
                       request.headers.referer?.includes('strava://') // Vient de l'app Strava

    if (error) {
      if (isMobileApp && process.env.EXPO_SCHEME) {
        const deepLink = `${process.env.EXPO_SCHEME}://auth/strava?error=authorization_denied`
        return reply.redirect(deepLink)
      }
      return reply.status(400).send({ error: 'Strava authorization denied' })
    }

    if (!code) {
      if (isMobileApp && process.env.EXPO_SCHEME) {
        const deepLink = `${process.env.EXPO_SCHEME}://auth/strava?error=no_code`
        return reply.redirect(deepLink)
      }
      return reply.status(400).send({ error: 'No authorization code received' })
    }

    try {
      // Échange sécurisé du code (même logique pour web et mobile)
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

      // deeplink
      if (isMobileApp && process.env.EXPO_SCHEME) {
        const deepLink = `${process.env.EXPO_SCHEME}://auth/strava?token=${jwtToken}&success=true&user=${encodeURIComponent(JSON.stringify({
          id: user.id,
          username: user.username,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar
        }))}`
        return reply.redirect(deepLink)
      }

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

    } catch (error) {
      fastify.log.error('Strava callback error:', error)
      
      if (isMobileApp && process.env.EXPO_SCHEME) {
        const deepLink = `${process.env.EXPO_SCHEME}://auth/strava?error=token_exchange_failed`
        return reply.redirect(deepLink)
      }
      
      return reply.status(500).send({ 
        error: 'Failed to exchange authorization code',
        details: process.env.NODE_ENV === 'development' ? error : undefined
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

    } catch (error) {
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