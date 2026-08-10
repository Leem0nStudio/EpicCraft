// Billboard sprite system - barrel exports.

export type { BillboardSpriteOptions } from './billboard';
export { BillboardSprite } from './billboard';
export type { SpriteEntry } from './loader';
export {
  createBillboardGeometry,
  getBillboardMaterial,
  getFrameUvArray,
  getMetaSync,
  getSpriteUrlsForEntity,
  loadSpriteSheetMeta,
  loadSpriteSheetTexture,
  preloadBillboardMeta,
  preloadBillboardTexture,
  updateBillboardFrame,
} from './loader';
export {
  getAllSpriteFilenames,
  getSpriteFilename,
  getSpriteUrls,
  registerSprite,
} from './sprite_registry';
export type { AnimationType, BillboardAnimState, Direction, SpriteSheetMeta } from './types';
export {
  cameraRelativeDirection,
  createBillboardAnimState,
  getAnimFPS,
  getAnimRow,
  getFrameQuadUVs,
  getFrameUVs,
  getSourceDirection,
} from './types';
