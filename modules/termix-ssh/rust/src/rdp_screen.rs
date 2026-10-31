//! What the phone shows of an RDP session on top of IronRDP's image: the mouse cursor, drawn
//! into the frames we send, and when the first desktop is drawn well enough to show.

use std::time::{Duration, Instant};

use ironrdp::graphics::pointer::DecodedPointer;

use crate::display::Damage;

/// A cursor image, RGBA without premultiplied alpha.
#[derive(Debug, Clone, PartialEq)]
pub(crate) struct Shape {
    pub w: u32,
    pub h: u32,
    pub hot_x: u32,
    pub hot_y: u32,
    pub rgba: Vec<u8>,
}

impl Shape {
    pub(crate) fn from_pointer(p: &DecodedPointer) -> Option<Self> {
        let (w, h) = (p.width as u32, p.height as u32);
        (w > 0 && h > 0 && p.bitmap_data.len() >= (w * h * 4) as usize).then(|| Shape {
            w,
            h,
            hot_x: p.hotspot_x as u32,
            hot_y: p.hotspot_y as u32,
            rgba: p.bitmap_data.clone(),
        })
    }

    /// A plain arrow for when the server says to use the system one. `scale` is a whole multiple.
    pub(crate) fn arrow(scale: u32) -> Self {
        const ART: [&str; 17] = [
            "X          ",
            "XX         ",
            "XoX        ",
            "XooX       ",
            "XoooX      ",
            "XooooX     ",
            "XoooooX    ",
            "XooooooX   ",
            "XoooooooX  ",
            "XooooooooX ",
            "XoooooXXXXX",
            "XooXooX    ",
            "XoX XooX   ",
            "XX  XooX   ",
            "X    XooX  ",
            "     XooX  ",
            "      XX   ",
        ];
        let s = scale.clamp(1, 5);
        let (w, h) = (ART[0].len() as u32 * s, ART.len() as u32 * s);
        let mut rgba = vec![0u8; (w * h * 4) as usize];
        for y in 0..h {
            for x in 0..w {
                let px = match ART[(y / s) as usize].as_bytes()[(x / s) as usize] {
                    b'X' => [0, 0, 0, 255],
                    b'o' => [255, 255, 255, 255],
                    _ => continue,
                };
                let i = ((y * w + x) * 4) as usize;
                rgba[i..i + 4].copy_from_slice(&px);
            }
        }
        Shape { w, h, hot_x: 0, hot_y: 0, rgba }
    }
}

/// The remote mouse cursor. IronRDP's image stays clean; the cursor is only blended into the
/// pixels on their way to the view.
pub(crate) struct Cursor {
    shape: Shape,
    scale: u32,
    x: u32,
    y: u32,
    visible: bool,
}

impl Cursor {
    pub(crate) fn new(scale: u32, x: u32, y: u32) -> Self {
        Cursor { shape: Shape::arrow(scale), scale, x, y, visible: true }
    }

    pub(crate) fn scale(&self) -> u32 {
        self.scale
    }

    /// Where it is drawn, as (x, y, w, h). May reach past the frame.
    fn area(&self) -> Option<(i64, i64, u32, u32)> {
        self.visible.then(|| {
            (
                self.x as i64 - self.shape.hot_x as i64,
                self.y as i64 - self.shape.hot_y as i64,
                self.shape.w,
                self.shape.h,
            )
        })
    }

    pub(crate) fn mark(&self, damage: &mut Damage) {
        if let Some((x, y, w, h)) = self.area() {
            let (x2, y2) = (x + w as i64, y + h as i64);
            let (x, y) = (x.max(0), y.max(0));
            if x2 > x && y2 > y {
                damage.add(x as u32, y as u32, (x2 - x) as u32, (y2 - y) as u32);
            }
        }
    }

    /// Runs a change and marks where the cursor was and where it is now.
    fn change(&mut self, damage: &mut Damage, f: impl FnOnce(&mut Self)) {
        self.mark(damage);
        f(self);
        self.mark(damage);
    }

    pub(crate) fn move_to(&mut self, x: u32, y: u32, damage: &mut Damage) {
        if (x, y) != (self.x, self.y) {
            self.change(damage, |c| (c.x, c.y) = (x, y));
        }
    }

    pub(crate) fn set_shape(&mut self, shape: Shape, damage: &mut Damage) {
        self.change(damage, |c| {
            c.shape = shape;
            c.visible = true;
        });
    }

    pub(crate) fn set_visible(&mut self, visible: bool, damage: &mut Damage) {
        if visible != self.visible {
            self.change(damage, |c| c.visible = visible);
        }
    }

    /// Blends the cursor into `out`, a `w * h` RGBA crop whose top left is (ox, oy) in the frame.
    pub(crate) fn draw(&self, out: &mut [u8], ox: u32, oy: u32, w: u32, h: u32) {
        let Some((cx, cy, cw, ch)) = self.area() else { return };
        let (ox, oy) = (ox as i64, oy as i64);
        let x1 = cx.max(ox);
        let y1 = cy.max(oy);
        let x2 = (cx + cw as i64).min(ox + w as i64);
        let y2 = (cy + ch as i64).min(oy + h as i64);
        for y in y1..y2 {
            for x in x1..x2 {
                let s = (((y - cy) * cw as i64 + (x - cx)) * 4) as usize;
                let a = self.shape.rgba[s + 3] as u32;
                if a == 0 {
                    continue;
                }
                let d = (((y - oy) * w as i64 + (x - ox)) * 4) as usize;
                for c in 0..3 {
                    let src = self.shape.rgba[s + c] as u32;
                    let dst = out[d + c] as u32;
                    out[d + c] = ((src * a + dst * (255 - a)) / 255) as u8;
                }
                out[d + 3] = 255;
            }
        }
    }
}

/// Server drawing this large, as a share of the screen, counts as the desktop still coming in.
const BIG_SHARE: u64 = 50;
/// Shown once the screen has had something on it and big changes stopped for this long.
const QUIET: Duration = Duration::from_millis(600);
/// Shown this long after the first drawing even if it keeps changing, like a busy login screen.
const DRAWN_CAP: Duration = Duration::from_secs(10);
/// Shown this long after login even if the screen stays black.
const BLANK_CAP: Duration = Duration::from_secs(30);

/// Decides when the first desktop is ready to show, so the app keeps its connecting screen
/// over the black frames a Windows login sends first.
pub(crate) struct FirstPaint {
    start: Instant,
    drawn: Option<Instant>,
    last_big: Instant,
}

impl FirstPaint {
    pub(crate) fn new(now: Instant) -> Self {
        FirstPaint { start: now, drawn: None, last_big: now }
    }

    pub(crate) fn waiting_for_content(&self) -> bool {
        self.drawn.is_none()
    }

    /// The server drew `area` pixels of a `screen` pixel frame. `content` says whether any of it
    /// was not black.
    pub(crate) fn drew(&mut self, now: Instant, area: u64, screen: u64, content: bool) {
        if content && self.drawn.is_none() {
            self.drawn = Some(now);
            self.last_big = now;
        }
        if area * BIG_SHARE >= screen {
            self.last_big = now;
        }
    }

    pub(crate) fn ready(&self, now: Instant) -> bool {
        match self.drawn {
            Some(at) => now - self.last_big >= QUIET || now - at >= DRAWN_CAP,
            None => now - self.start >= BLANK_CAP,
        }
    }
}

/// Whether any pixel in the area is clearly not black. Checks every other pixel.
pub(crate) fn has_content(rgba: &[u8], width: u32, x: u32, y: u32, w: u32, h: u32) -> bool {
    (y..y + h).step_by(2).any(|row| {
        (x..x + w).step_by(2).any(|col| {
            let i = ((row * width + col) * 4) as usize;
            rgba.get(i..i + 3).is_some_and(|p| p.iter().any(|&c| c > 24))
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arrow_scales_and_has_a_tip_at_the_hotspot() {
        let a = Shape::arrow(2);
        assert_eq!((a.w, a.h), (22, 34));
        assert_eq!(&a.rgba[0..4], &[0, 0, 0, 255]);
        assert_eq!(a.rgba[(10 * 4) + 3], 0);
    }

    #[test]
    fn cursor_marks_old_and_new_places_and_blends() {
        let mut c = Cursor::new(1, 5, 5);
        let mut d = Damage::default();
        c.move_to(20, 30, &mut d);
        assert_eq!(d, Damage { x1: 5, y1: 5, x2: 31, y2: 47 });

        let mut d = Damage::default();
        c.set_visible(false, &mut d);
        assert!(!d.is_empty());
        let mut d = Damage::default();
        c.set_visible(false, &mut d);
        assert!(d.is_empty());

        // Near the corner the hotspot puts part of it off screen.
        let mut c = Cursor::new(1, 0, 0);
        c.set_shape(Shape { w: 2, h: 2, hot_x: 1, hot_y: 1, rgba: vec![255; 16] }, &mut Damage::default());
        let mut out = vec![0u8; 2 * 2 * 4];
        c.draw(&mut out, 0, 0, 2, 2);
        assert_eq!(&out[0..4], &[255, 255, 255, 255]);
        assert_eq!(&out[4..8], &[0, 0, 0, 0]);
    }

    #[test]
    fn first_paint_waits_for_content_then_quiet() {
        let t = Instant::now();
        let ms = |n| t + Duration::from_millis(n);
        let mut p = FirstPaint::new(t);
        p.drew(ms(100), 1000, 1000, false);
        assert!(!p.ready(ms(5_000)));
        p.drew(ms(5_000), 1000, 1000, true);
        assert!(!p.ready(ms(5_300)));
        // Small changes like a spinner don't hold it back.
        p.drew(ms(5_400), 1, 1000, true);
        assert!(p.ready(ms(5_700)));
        assert!(FirstPaint::new(t).ready(ms(30_000)));
    }

    #[test]
    fn first_paint_gives_up_on_a_busy_screen() {
        let t = Instant::now();
        let mut p = FirstPaint::new(t);
        for n in 0..200 {
            p.drew(t + Duration::from_millis(n * 100), 1000, 1000, true);
        }
        assert!(p.ready(t + Duration::from_secs(10)));
    }

    #[test]
    fn content_ignores_near_black() {
        let mut px = vec![0u8; 4 * 4 * 4];
        assert!(!has_content(&px, 4, 0, 0, 4, 4));
        px[(2 * 4 + 2) * 4] = 200;
        assert!(has_content(&px, 4, 0, 0, 4, 4));
        assert!(!has_content(&px, 4, 0, 0, 2, 2));
    }
}
