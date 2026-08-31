import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const ENCRYPTION_KEY = process.env.CREDENTIAL_ENCRYPTION_KEY || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ALGORITHM = 'aes-256-gcm';

// 32-byte key derived from secret
function getKey(): Buffer {
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

/**
 * Encrypt sensitive credentials (passwords, tokens, API keys) before storing at rest
 */
export function encryptSecret(plainText: string): { encrypted: string; iv: string; tag: string } {
  if (!plainText) return { encrypted: '', iv: '', tag: '' };
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    tag
  };
}

/**
 * Decrypt sensitive credentials at runtime in backend only
 */
export function decryptSecret(encrypted: string, iv: string, tag: string): string {
  if (!encrypted || !iv || !tag) return '';
  
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('Failed to decrypt credential:', err);
    return '';
  }
}

/**
 * Hash password with bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password with hash
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
