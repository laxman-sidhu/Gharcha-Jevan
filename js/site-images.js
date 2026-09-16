/**
 * SITE IMAGES — the fixed photos used by the page layout.
 *
 * All section photos are defined here and nowhere else (the HTML only has
 * data-site-image="key" slots). To replace a photo:
 *   - hero / about: the owner can upload new ones in Admin → Business info
 *     (those uploads override the values below), or
 *   - paste a Cloudinary URL into `src` below.
 *
 * SAMPLE PHOTOS: the `src` values are free Unsplash photos used only for the
 * concept preview. They do not show the owner's food. Credits are listed in
 * assets/README.md (Sample photos). If a photo cannot load, the local
 * placeholder artwork in `fallback` is shown instead.
 */
import { PLACEHOLDERS } from "./services/images.js";

export const SITE_IMAGES = {
  hero: {
    src: "https://images.unsplash.com/photo-1756741987051-a6a38f28838b",
    alt: "Sample photo: a coastal fish thali with fried fish, curry and rice",
    ratio: [4, 5],
    widths: [480, 760, 1100],
    sizes: "(min-width: 1024px) 42vw, 92vw",
    fallback: PLACEHOLDERS.hero,
    eager: true,
  },
  about: {
    src: "https://images.unsplash.com/photo-1742281257707-0c7f7e5ca9c6",
    alt: "Sample photo: home-style thalis with rice and several dishes",
    ratio: [4, 5],
    widths: [420, 680, 960],
    sizes: "(min-width: 1024px) 40vw, 92vw",
    fallback: PLACEHOLDERS.about,
  },
  specialityFish: {
    src: "https://images.unsplash.com/photo-1765265432611-17d3f2da2d5d",
    alt: "Sample photo: two masala-coated fried fish with lime",
    ratio: [4, 5],
    widths: [360, 560, 820],
    sizes: "(min-width: 1024px) 30vw, (min-width: 720px) 45vw, 92vw",
    fallback: PLACEHOLDERS.fish,
  },
  specialityChicken: {
    src: "https://images.unsplash.com/photo-1603894584373-5ac82b2ae398",
    alt: "Sample photo: chicken curry in a bowl",
    ratio: [4, 5],
    widths: [360, 560, 820],
    sizes: "(min-width: 1024px) 30vw, (min-width: 720px) 45vw, 92vw",
    fallback: PLACEHOLDERS.chicken,
  },
  specialityThali: {
    src: "https://images.unsplash.com/photo-1680993032090-1ef7ea9b51e5",
    alt: "Sample photo: a steel thali with rice and several dishes",
    ratio: [4, 5],
    widths: [360, 560, 820],
    sizes: "(min-width: 1024px) 30vw, (min-width: 720px) 45vw, 92vw",
    fallback: PLACEHOLDERS.thali,
  },
};
