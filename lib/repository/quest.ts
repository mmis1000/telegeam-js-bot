import type { IRepositoryQuest, QuestAnswered } from "../interfaces";
import { BaseRepository } from "./base";

export class RepositoryQuest extends BaseRepository<QuestAnswered> implements IRepositoryQuest { }