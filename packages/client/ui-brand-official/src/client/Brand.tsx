import { BrandWordmark, FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the official mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the official whale mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <FishLogo size={size} />
}

/**
 * Render the official name artwork without its independently slotted mark.
 * @returns the official name wordmark.
 */
export function OfficialBrandName() {
  return <BrandWordmark includeMark={false} />
}

/**
 * Render a deployment brand label where the official mark would sit: the label
 * carries the identity, so the mark column stays empty and keeps its width.
 * @returns an empty placeholder element.
 */
export function ProjectBrandMark() {
  return <span aria-hidden="true" />
}

/** Presentation for a deployment brand label in the sidebar name seat. */
export interface ProjectBrandNameProps {
  /** Deployment label shown instead of the official wordmark. */
  title: string
}

/**
 * Render the deployment label in the sidebar name seat.
 * @param props - the label to show.
 * @returns the brand label element.
 */
export function ProjectBrandName({ title }: ProjectBrandNameProps) {
  return (
    <span
      style={{
        display: 'block',
        maxWidth: 180,
        overflow: 'hidden',
        color: 'inherit',
        fontSize: 14,
        fontWeight: 600,
        letterSpacing: '0.01em',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
      title={title}
    >
      {title}
    </span>
  )
}
