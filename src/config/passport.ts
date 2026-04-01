/**
 * ============================================
 * PASSPORT CONFIGURATION
 * ============================================
 *
 * Configures Passport.js strategies:
 * - Google OAuth 2.0
 * - Apple Sign-In
 *
 * @file src/config/passport.ts
 */

import passport from 'passport';
import {
  Strategy as GoogleStrategy,
  Profile as GoogleProfile,
  VerifyCallback,
} from 'passport-google-oauth20';
import { createRequire } from 'module';
// passport-apple has no bundled type declarations; use createRequire for CJS interop in ESM
const AppleStrategy = createRequire(import.meta.url)('passport-apple');
import jwt from 'jsonwebtoken';
import { User, IUser } from '../models/User.js';

// ============================================
// GOOGLE OAUTH STRATEGY
// ============================================

// Only register if credentials are configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || '/api/v1/auth/google/callback',
      scope: ['profile', 'email'],
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: GoogleProfile,
      done: VerifyCallback
    ) => {
      try {
        const email = profile.emails?.[0]?.value;
        const avatar = profile.photos?.[0]?.value;
        const firstName = profile.name?.givenName || 'User';
        const lastName = profile.name?.familyName || '';

        if (!email) {
          return done(new Error('No email found in Google profile'));
        }

        // Find existing user by googleId
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          // Check if email already registered (link accounts)
          user = await User.findOne({ email: email.toLowerCase() });

          if (user) {
            // Link Google account to existing user
            user.googleId = profile.id;
            if (!user.avatar && avatar) user.avatar = avatar;
            await user.save();
          } else {
            // Create new user from Google profile
            user = await User.create({
              email: email.toLowerCase(),
              googleId: profile.id,
              firstName,
              lastName,
              avatar,
              isVerified: true, // Google accounts are pre-verified
              password: Math.random().toString(36) + Math.random().toString(36), // Random password
            });
          }
        }

        if (!user.isActive) {
          return done(new Error('Account has been deactivated'));
        }

        return done(null, user as IUser);
      } catch (error) {
        return done(error as Error);
      }
    }
  )
  );
}

// ============================================
// APPLE SIGN-IN STRATEGY
// ============================================

interface AppleIdTokenPayload {
  sub?: string;   // Apple user ID (stable per app)
  email?: string; // May be missing on subsequent logins
  email_verified?: boolean;
}

// Only register if Apple credentials are configured
if (
  process.env.APPLE_CLIENT_ID &&
  process.env.APPLE_TEAM_ID &&
  process.env.APPLE_KEY_ID &&
  process.env.APPLE_PRIVATE_KEY
) {
  passport.use(
    new AppleStrategy(
      {
        clientID: process.env.APPLE_CLIENT_ID,
        teamID: process.env.APPLE_TEAM_ID,
        keyID: process.env.APPLE_KEY_ID,
        privateKeyString: process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        callbackURL: process.env.APPLE_CALLBACK_URL || '/api/v1/auth/apple/callback',
        passReqToCallback: false,
      },
      async (
        _accessToken: string,
        _refreshToken: string,
        idTokenJwt: string,        // Raw encoded JWT — must be decoded
        profile: { name?: { firstName?: string; lastName?: string } },
        done: (err: Error | null, user?: IUser | false) => void
      ) => {
        try {
          // Decode (not verify — Apple signature verified by passport-apple internally)
          const idToken = jwt.decode(idTokenJwt) as AppleIdTokenPayload | null;

          const appleId = idToken?.sub;
          const email = idToken?.email;

          if (!appleId) {
            return done(new Error('No Apple ID (sub) found in id_token'));
          }

          // Find existing user by appleId
          let user = await User.findOne({ appleId });

          if (!user) {
            if (email) {
              // Check if email already registered (link accounts)
              user = await User.findOne({ email: email.toLowerCase() });
              if (user) {
                user.appleId = appleId;
                await user.save();
              }
            }

            if (!user) {
              // Apple only provides name on first login
              const firstName = profile.name?.firstName || 'User';
              const lastName = profile.name?.lastName || '';

              user = await User.create({
                // Apple may use private relay email — store as-is
                email: email?.toLowerCase() || `${appleId}@privaterelay.appleid.com`,
                appleId,
                firstName,
                lastName,
                isVerified: true, // Apple accounts are pre-verified
                password: Math.random().toString(36) + Math.random().toString(36),
              });
            }
          }

          if (!user.isActive) {
            return done(new Error('Account has been deactivated'));
          }

          return done(null, user as IUser);
        } catch (error) {
          return done(error as Error);
        }
      }
    )
  );
}

// ============================================
// SERIALIZE / DESERIALIZE (for session — optional)
// ============================================

passport.serializeUser((user, done) => {
  done(null, (user as IUser).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await User.findById(id).select('-password');
    done(null, user);
  } catch (error) {
    done(error);
  }
});

export default passport;
