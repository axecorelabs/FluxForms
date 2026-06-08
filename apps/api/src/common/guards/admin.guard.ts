import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const key = req.headers['x-admin-key'];
    const expected = process.env.ADMIN_API_KEY;

    if (!expected) throw new UnauthorizedException('ADMIN_API_KEY not configured on server');
    if (key !== expected) throw new UnauthorizedException('Invalid admin API key');

    return true;
  }
}
