import type { IRepositorySession, Session } from "../interfaces";
import { BaseRepository } from "./base";

export class RepositorySession extends BaseRepository<Session> implements IRepositorySession { }