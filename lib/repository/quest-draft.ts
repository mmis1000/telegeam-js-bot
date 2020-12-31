import type { IRepositoryQuestDraft, QuestDraft } from "../interfaces";
import { BaseRepository } from "./base";

export class RepositoryQuestDraft extends BaseRepository<QuestDraft> implements IRepositoryQuestDraft { }