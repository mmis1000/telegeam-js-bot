import type { IRepositoryQuest, Quest } from "../interfaces";
import { BaseRepository } from "./base";

export class RepositoryQuest extends BaseRepository<Quest> implements IRepositoryQuest { }