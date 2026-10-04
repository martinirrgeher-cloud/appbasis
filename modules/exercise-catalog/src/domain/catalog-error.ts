export class ExerciseCatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExerciseCatalogValidationError";
  }
}
