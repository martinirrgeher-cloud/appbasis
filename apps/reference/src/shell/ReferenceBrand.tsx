export interface ReferenceBrandClasses {
  readonly root: string;
  readonly mark: string;
}

export interface ReferenceBrandProps {
  readonly classes: ReferenceBrandClasses;
}

export function ReferenceBrand({ classes }: ReferenceBrandProps) {
  return (
    <a className={classes.root} href="#dashboard" aria-label="AppBasis Startseite">
      <span className={classes.mark} aria-hidden="true">A</span>
      <span>AppBasis</span>
    </a>
  );
}
