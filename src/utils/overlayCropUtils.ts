const MAX_CROP_PER_EDGE = 0.4;

export const getOverlayCropMax = (
  previewDimension: number,
  previewScale: number,
  sourceScale: number,
) => {
  if (
    !Number.isFinite(previewDimension) ||
    !Number.isFinite(previewScale) ||
    !Number.isFinite(sourceScale) ||
    previewDimension <= 0 ||
    previewScale <= 0 ||
    sourceScale <= 0
  ) {
    return 0;
  }

  const sourceDimension = previewDimension / (previewScale * sourceScale);
  return Math.floor(sourceDimension * MAX_CROP_PER_EDGE);
};

export const normalizeOverlayCrop = (crop: number, sourceDimension: number) => {
  if (!Number.isFinite(crop) || !Number.isFinite(sourceDimension)) return 0;
  const maximum = Math.max(0, Math.floor(sourceDimension * MAX_CROP_PER_EDGE));
  return Math.min(Math.max(0, Math.round(crop)), maximum);
};
