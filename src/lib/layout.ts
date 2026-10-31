// Keep these queries aligned with the responsive mixins in styles/_mixins.scss.

/** phones: one panel at a time, behind tabs */
export const COMPACT_LAYOUT_QUERY = '(max-width: 767px)';

/** Tablets and narrow windows keep the desktop columns, but the course details
 *  don't fit beside the board and slide in over it instead. A touch screen
 *  wants the board roomier, so an iPad switches over sooner. */
export const DETAILS_OVERLAY_QUERY = '(max-width: 1279px), (max-width: 1400px) and (any-pointer: coarse)';

/** narrower still (an iPad held upright), the sidebar slides in from the left too */
export const RAIL_OVERLAY_QUERY = '(max-width: 1099px)';
