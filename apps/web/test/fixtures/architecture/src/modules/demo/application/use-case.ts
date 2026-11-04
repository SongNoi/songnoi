import { Entity } from "../domain/entity"

export const useCase = (raw: unknown) => Entity.parse(raw)
