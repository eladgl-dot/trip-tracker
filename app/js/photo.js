// Shrink a camera/gallery photo to a small JPEG data URL (about 100–250 KB) before saving it.
import { fitSize } from './logic.js';

export async function shrinkImage(file, max = 1000) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // the browser applies the photo's EXIF rotation
    const { w, h } = fitSize(img.naturalWidth, img.naturalHeight, max);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.drawImage(img, 0, 0, w, h);
    let data = c.toDataURL('image/jpeg', 0.72);
    if (data.length > 350000) data = c.toDataURL('image/jpeg', 0.5);
    return data;
  } finally { URL.revokeObjectURL(url); }
}
