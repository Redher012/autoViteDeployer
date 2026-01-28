import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export async function POST(request) {
  try {
    const { password } = await request.json();
    
    // Get password from environment variable (support both lognPass and LOGIN_PASS)
    const correctPassword = process.env.lognPass || process.env.LOGIN_PASS || '0000';
    
    if (password !== correctPassword) {
      return NextResponse.json(
        { error: 'Invalid password' },
        { status: 401 }
      );
    }
    
    // Generate a secure token
    const token = crypto.randomBytes(32).toString('hex');
    
    // Set cookie for 15 days
    const cookieStore = await cookies();
    cookieStore.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 15, // 15 days in seconds
      path: '/',
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Login failed' },
      { status: 500 }
    );
  }
}
