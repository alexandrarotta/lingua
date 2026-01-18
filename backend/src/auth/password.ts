import bcrypt from "bcryptjs";

const DEFAULT_COST = 12;

function cost() {
  const raw = Number(process.env.BCRYPT_COST ?? DEFAULT_COST);
  if (!Number.isFinite(raw)) return DEFAULT_COST;
  return Math.max(10, Math.min(14, Math.floor(raw)));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await new Promise<string>((resolve, reject) => {
    bcrypt.genSalt(cost(), (err, s) => {
      if (err) reject(err);
      else if (!s) reject(new Error("bcrypt.genSalt returned empty salt"));
      else resolve(s);
    });
  });

  return await new Promise<string>((resolve, reject) => {
    bcrypt.hash(password, salt, (err, hash) => {
      if (err) reject(err);
      else if (!hash) reject(new Error("bcrypt.hash returned empty hash"));
      else resolve(hash);
    });
  });
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    bcrypt.compare(password, passwordHash, (err, same) => {
      if (err) reject(err);
      else resolve(!!same);
    });
  });
}
