// Billboard sprite system - barrel exports.
export { BillboardSprite } from './billboard';
export type { BillboardSpriteOptions } from './billboard';
export { loadSpriteSheetTexture, loadSpriteSheetMeta, preloadBillboardMeta, preloadBillboardTexture, getMetaSync, createBillboardMaterial, updateMaterialFrame, getSpriteUrlsForEntity } from './loader';
export type { SpriteEntry } from './loader';
export { getSpriteFilename, getSpriteUrls, getAllSpriteFilenames, registerSprite } from './sprite_registry';
export type { Direction, AnimationType, SpriteSheetMeta, BillboardAnimState } from './types';
export { createBillboardAnimState, getSourceDirection, getFrameUVs, getAnimRow, getAnimFPS, cameraRelativeDirection } from './types';
