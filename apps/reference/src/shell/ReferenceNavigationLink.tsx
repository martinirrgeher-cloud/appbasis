import type { ReactNode } from 'react';

export interface ReferenceNavigationLinkClasses {
  readonly root: string;
  readonly active: string;
}

export interface ReferenceNavigationLinkProps {
  readonly classes: ReferenceNavigationLinkClasses;
  readonly href: string;
  readonly active?: boolean;
  readonly children: ReactNode;
}

export function ReferenceNavigationLink({
  classes,
  href,
  active = false,
  children,
}: ReferenceNavigationLinkProps) {
  const className = `${classes.root}${active ? ` ${classes.active}` : ''}`;

  return (
    <a className={className} href={href} aria-current={active ? 'page' : undefined}>
      {children}
    </a>
  );
}
