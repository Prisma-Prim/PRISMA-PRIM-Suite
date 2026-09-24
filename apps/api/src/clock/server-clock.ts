import { Module } from '@nestjs/common';

/**
 * The one server-owned source of the current instant. Each command or read
 * samples it once and uses that value for every comparison and timestamp it
 * records; fixed-instant tests replace only this boundary. No job reads it.
 */
export const SERVER_CLOCK = Symbol('SERVER_CLOCK');
export interface ServerClock {
  now(): Date;
}

const systemClock: ServerClock = { now: () => new Date() };

@Module({
  providers: [{ provide: SERVER_CLOCK, useValue: systemClock }],
  exports: [SERVER_CLOCK],
})
export class ServerClockModule {}
