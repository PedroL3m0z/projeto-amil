import 'express';

declare global {
  namespace Express {
    interface User {
      userId: string;
      username: string;
    }
  }
}

export {};
