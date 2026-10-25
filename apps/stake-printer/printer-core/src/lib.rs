use std::alloc::{alloc as allocate, dealloc as deallocate, Layout};

struct ResultBuf(std::cell::UnsafeCell<Vec<u8>>);
unsafe impl Sync for ResultBuf {}
static RESULT: ResultBuf = ResultBuf(std::cell::UnsafeCell::new(Vec::new()));

fn result_buf() -> &'static mut Vec<u8> {
    unsafe { &mut *RESULT.0.get() }
}

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return 1 as *mut u8;
    }
    let layout = Layout::from_size_align(len, 1).expect("layout");
    let ptr = unsafe { allocate(layout) };
    if ptr.is_null() {
        std::alloc::handle_alloc_error(layout);
    }
    ptr
}

#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if len == 0 || ptr.is_null() || ptr as usize == 1 {
        return;
    }
    let layout = Layout::from_size_align(len, 1).expect("layout");
    unsafe { deallocate(ptr, layout) }
}

#[no_mangle]
pub extern "C" fn result_ptr() -> *const u8 {
    result_buf().as_ptr()
}

#[no_mangle]
pub extern "C" fn result_len() -> usize {
    result_buf().len()
}

fn set_result(bytes: Vec<u8>) {
    *result_buf() = bytes;
}

fn set_error(message: &str) {
    set_result(message.as_bytes().to_vec());
}

#[no_mangle]
pub extern "C" fn preview_origin_x() -> f64 {
    0.57 - 128.0 / 203.0
}

#[no_mangle]
pub extern "C" fn preview_origin_y() -> f64 {
    0.1745
}

fn is_ink(pixels: &[u8], index: usize) -> bool {
    pixels.get(index * 4).is_some_and(|red| *red < 128)
}

#[no_mangle]
pub extern "C" fn pack_bitmap(pixels: *const u8, width: u32, height: u32) -> i32 {
    let width = width as usize;
    let height = height as usize;
    let len = width.saturating_mul(height).saturating_mul(4);
    let pixels = unsafe { std::slice::from_raw_parts(pixels, len) };
    set_result(pack(pixels, width, height));
    0
}

fn pack(pixels: &[u8], width: usize, height: usize) -> Vec<u8> {
    let stride = width.div_ceil(8);
    let mut bytes = vec![255u8; stride * height];
    for y in 0..height {
        for x in 0..width {
            if is_ink(pixels, y * width + x) {
                bytes[y * stride + (x >> 3)] &= !(0x80 >> (x & 7));
            }
        }
    }
    bytes
}

#[no_mangle]
pub extern "C" fn crop_ink(pixels: *const u8, width: u32, height: u32) -> i32 {
    let width = width as usize;
    let height = height as usize;
    let len = width.saturating_mul(height).saturating_mul(4);
    let pixels = unsafe { std::slice::from_raw_parts(pixels, len) };
    let Some(cropped) = crop(pixels, width, height) else {
        set_result(Vec::new());
        return 2;
    };
    let mut out = Vec::with_capacity(16 + cropped.pixels.len());
    out.extend_from_slice(&(cropped.x as u32).to_le_bytes());
    out.extend_from_slice(&(cropped.y as u32).to_le_bytes());
    out.extend_from_slice(&(cropped.width as u32).to_le_bytes());
    out.extend_from_slice(&(cropped.height as u32).to_le_bytes());
    out.extend_from_slice(&cropped.pixels);
    set_result(out);
    0
}

struct Cropped {
    x: usize,
    y: usize,
    width: usize,
    height: usize,
    pixels: Vec<u8>,
}

fn crop(pixels: &[u8], width: usize, height: usize) -> Option<Cropped> {
    let mut left = width;
    let mut top = height;
    let mut right = None;
    let mut bottom = 0usize;
    for y in 0..height {
        for x in 0..width {
            if is_ink(pixels, y * width + x) {
                left = left.min(x);
                top = top.min(y);
                right = Some(right.map_or(x, |value: usize| value.max(x)));
                bottom = bottom.max(y);
            }
        }
    }
    let right = right?;
    let cropped_width = right - left + 1;
    let cropped_height = bottom - top + 1;
    let mut cropped = vec![0u8; cropped_width * cropped_height * 4];
    for y in 0..cropped_height {
        let start = ((top + y) * width + left) * 4;
        let dest = y * cropped_width * 4;
        cropped[dest..dest + cropped_width * 4]
            .copy_from_slice(&pixels[start..start + cropped_width * 4]);
    }
    Some(Cropped { x: left, y: top, width: cropped_width, height: cropped_height, pixels: cropped })
}

#[no_mangle]
pub extern "C" fn stamp_dot(bytes: *const u8, len: u32, stride: u32, height: u32) -> i32 {
    let src = unsafe { std::slice::from_raw_parts(bytes, len as usize) };
    set_result(stamp(src, stride as usize, height as usize));
    0
}

fn stamp(src: &[u8], stride: usize, height: usize) -> Vec<u8> {
    let mut bytes = src.to_vec();
    let width = stride.saturating_mul(8);
    for x in 0..width {
        if let Some(byte) = bytes.get_mut(x >> 3) {
            *byte &= !(0x80 >> (x & 7));
        }
    }
    for y in 0..height {
        if let Some(byte) = bytes.get_mut(y * stride) {
            *byte &= !0x80;
        }
    }
    bytes
}

#[no_mangle]
pub extern "C" fn job_parts(
    print_height: f64,
    gap: f64,
    copies: u32,
    density: u32,
    direction: u32,
    speed: u32,
    reg: u32,
    x: u32,
    y: u32,
    stride: u32,
    height: u32,
    bitmap: *const u8,
    bitmap_len: u32,
) -> i32 {
    let bitmap = if bitmap.is_null() || bitmap_len == 0 {
        None
    } else {
        Some(unsafe { std::slice::from_raw_parts(bitmap, bitmap_len as usize) })
    };
    set_result(encode_parts(&job(print_height, gap, copies, density, direction, speed, reg, x, y, stride, height, bitmap)));
    0
}

enum Part<'a> {
    Text(String),
    Bytes(&'a [u8]),
}

fn job<'a>(
    print_height: f64,
    gap: f64,
    copies: u32,
    density: u32,
    direction: u32,
    speed: u32,
    reg: u32,
    x: u32,
    y: u32,
    stride: u32,
    height: u32,
    bitmap: Option<&'a [u8]>,
) -> Vec<Part<'a>> {
    let mut header = format!("SIZE 4.00,{print_height}");
    match reg {
        1 => header.push_str(&format!("\r\nGAP {},0", format_inches(gap))),
        2 => header.push_str(&format!("\r\nBLINE {},0", format_inches(gap))),
        3 => header.push_str("\r\nGAP 0,0"),
        _ => {}
    }
    header.push_str(&format!("\r\nSPEED {speed}\r\nDENSITY {density}\r\nDIRECTION {direction},0\r\nCLS\r\n"));
    let mut parts = vec![Part::Text(header)];
    if let Some(bytes) = bitmap {
        parts.push(Part::Text(format!("BITMAP {x},{y},{stride},{height},0,")));
        parts.push(Part::Bytes(bytes));
        parts.push(Part::Text("\r\n".to_string()));
    }
    parts.push(Part::Text(format!("PRINT {copies},1\r\n")));
    parts
}

fn format_inches(n: f64) -> String {
    let mut text = format!("{n:.3}");
    while text.ends_with('0') {
        text.pop();
    }
    if text.ends_with('.') {
        text.pop();
    }
    text
}

fn encode_parts(parts: &[Part<'_>]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&(parts.len() as u32).to_le_bytes());
    for part in parts {
        let (kind, bytes) = match part {
            Part::Text(text) => (0u32, text.as_bytes()),
            Part::Bytes(bytes) => (1u32, *bytes),
        };
        out.extend_from_slice(&kind.to_le_bytes());
        out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(bytes);
    }
    out
}

#[no_mangle]
pub extern "C" fn parse_tspl(bytes: *const u8, len: u32) -> i32 {
    let bytes = unsafe { std::slice::from_raw_parts(bytes, len as usize) };
    match parse(bytes) {
        Ok(parsed) => {
            set_result(parsed);
            0
        }
        Err(message) => {
            set_error(&message);
            1
        }
    }
}

fn parse(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() > 1024 * 1024 {
        return Err("TSPL file exceeds 1 MB.".to_string());
    }
    let mut seen = Vec::new();
    let mut bitmap = None;
    let mut pos = 0usize;
    let mut print_height = None;
    let mut gap = None;
    let mut reg = 0u8;
    let mut speed = None;
    let mut density = None;
    let mut direction = None;
    let mut copies = None;
    while pos < bytes.len() {
        if bytes[pos] == b'\r' || bytes[pos] == b'\n' {
            pos += 1;
            continue;
        }
        if seen.iter().any(|command| command == "PRINT") {
            return Err("Only one print job can be imported.".to_string());
        }
        let prefix_end = (pos + 100).min(bytes.len());
        let prefix = ascii(&bytes[pos..prefix_end]);
        if let Some(image) = bitmap_header(&prefix) {
            if bitmap.is_some() || !seen.iter().any(|command| command == "CLS") {
                return Err("Expected one bitmap after CLS.".to_string());
            }
            if image.x > 65535 || image.y > 65535 || image.stride < 1 || image.stride > 102 || image.height < 1 || image.height > 4096 {
                return Err("Bitmap dimensions or coordinates are outside the supported range.".to_string());
            }
            pos += image.header_len;
            let end = pos + image.stride * image.height;
            if end > bytes.len() {
                return Err("Bitmap pixel data is truncated.".to_string());
            }
            bitmap = Some((image, bytes[pos..end].to_vec()));
            pos = end;
            if bytes.get(pos).is_none_or(|byte| *byte != b'\r' && *byte != b'\n') {
                return Err("Missing line ending after bitmap pixels.".to_string());
            }
            continue;
        }
        let line_end = bytes[pos..].iter().position(|byte| *byte == b'\n').map(|index| pos + index).unwrap_or(bytes.len());
        let line = ascii(&bytes[pos..line_end]).trim().to_string();
        pos = line_end + 1;
        let command = line.split_whitespace().next().unwrap_or("").to_ascii_uppercase();
        if seen.iter().any(|item| item == &command) {
            return Err(format!("Repeated command: {command}"));
        }
        if let Some(height) = size_height(&line) {
            if !(0.01..=90.0).contains(&height) {
                return Err("Invalid print height.".to_string());
            }
            print_height = Some(height);
        } else if let Some((kind, value)) = gap_command(&line) {
            if seen.iter().any(|item| item == "GAP" || item == "BLINE") {
                return Err("Conflicting registration commands.".to_string());
            }
            if !(0.0..=1.0).contains(&value) {
                return Err("Invalid gap.".to_string());
            }
            reg = if kind == "BLINE" { 2 } else if value == 0.0 { 3 } else { 1 };
            gap = Some(value);
        } else if let Some(value) = speed_value(&line) {
            speed = Some(value);
        } else if let Some(value) = density_value(&line) {
            density = Some(value);
        } else if let Some(value) = direction_value(&line) {
            direction = Some(value);
        } else if line.eq_ignore_ascii_case("CLS") {
            if bitmap.is_some() {
                return Err("CLS after bitmap is not supported.".to_string());
            }
        } else if let Some(value) = print_copies(&line) {
            if !seen.iter().any(|item| item == "CLS") {
                return Err("Missing CLS before PRINT.".to_string());
            }
            copies = Some(value);
        } else {
            let shown = line.chars().take(80).collect::<String>();
            return Err(format!("Unsupported TSPL command: {shown}. Import a file exported by this app."));
        }
        seen.push(command);
    }
    if !seen.iter().any(|item| item == "SIZE") || !seen.iter().any(|item| item == "PRINT") {
        return Err("Missing SIZE or PRINT command.".to_string());
    }
    let mut out = Vec::new();
    let mut flags = 0u32;
    if print_height.is_some() { flags |= 1; }
    if gap.is_some() { flags |= 2; }
    if copies.is_some() { flags |= 4; }
    if speed.is_some() { flags |= 8; }
    if density.is_some() { flags |= 16; }
    if direction.is_some() { flags |= 32; }
    if bitmap.is_some() { flags |= 64; }
    out.extend_from_slice(&flags.to_le_bytes());
    out.push(reg);
    out.push(speed.unwrap_or(0));
    out.extend_from_slice(&copies.unwrap_or(0).to_le_bytes());
    out.extend_from_slice(&density.unwrap_or(0).to_le_bytes());
    out.extend_from_slice(&print_height.unwrap_or(0.0).to_le_bytes());
    out.extend_from_slice(&gap.unwrap_or(0.0).to_le_bytes());
    out.push(direction.unwrap_or(0));
    if let Some((image, bytes)) = bitmap {
        out.extend_from_slice(&(image.x as u32).to_le_bytes());
        out.extend_from_slice(&(image.y as u32).to_le_bytes());
        out.extend_from_slice(&(image.stride as u32).to_le_bytes());
        out.extend_from_slice(&(image.height as u32).to_le_bytes());
        out.extend_from_slice(&(bytes.len() as u32).to_le_bytes());
        out.extend_from_slice(&bytes);
    }
    Ok(out)
}

struct BitmapHeader {
    x: usize,
    y: usize,
    stride: usize,
    height: usize,
    header_len: usize,
}

fn bitmap_header(prefix: &str) -> Option<BitmapHeader> {
    if prefix.len() < 6 || !prefix[..6].eq_ignore_ascii_case("BITMAP") {
        return None;
    }
    let after = prefix[6..].trim_start();
    let before_numbers = prefix.len() - after.len();
    let mut parts = after.splitn(5, ',');
    let x = parts.next()?.parse().ok()?;
    let y = parts.next()?.parse().ok()?;
    let stride = parts.next()?.parse().ok()?;
    let height = parts.next()?.parse().ok()?;
    let mode = parts.next()?;
    let mode_len = mode.find(',')?;
    if &mode[..mode_len] != "0" {
        return None;
    }
    let consumed = after.len() - mode.len() + mode_len + 1;
    Some(BitmapHeader { x, y, stride, height, header_len: before_numbers + consumed })
}

fn size_height(line: &str) -> Option<f64> {
    let rest = strip_command(line, "SIZE")?;
    let (width, height) = rest.split_once(',')?;
    let valid_width = width == "4" || width.strip_prefix("4.").is_some_and(|zeros| !zeros.is_empty() && zeros.chars().all(|ch| ch == '0'));
    if !valid_width || height.is_empty() || !height.chars().all(|ch| ch.is_ascii_digit() || ch == '.') {
        return None;
    }
    height.parse().ok()
}

fn gap_command(line: &str) -> Option<(&'static str, f64)> {
    let (kind, rest) = if let Some(rest) = strip_command(line, "GAP") {
        ("GAP", rest)
    } else if let Some(rest) = strip_command(line, "BLINE") {
        ("BLINE", rest)
    } else {
        return None;
    };
    let (value, zero) = rest.split_once(',')?;
    if zero != "0" {
        return None;
    }
    Some((kind, value.parse().ok()?))
}

fn speed_value(line: &str) -> Option<u8> {
    let rest = strip_command(line, "SPEED")?;
    match rest {
        "2" | "3" | "4" | "5" => rest.parse().ok(),
        _ => None,
    }
}

fn density_value(line: &str) -> Option<u16> {
    let rest = strip_command(line, "DENSITY")?;
    let value: u16 = rest.parse().ok()?;
    (value <= 15).then_some(value)
}

fn direction_value(line: &str) -> Option<u8> {
    let rest = strip_command(line, "DIRECTION")?;
    match rest {
        "0,0" => Some(0),
        "1,0" => Some(1),
        _ => None,
    }
}

fn print_copies(line: &str) -> Option<u16> {
    let rest = strip_command(line, "PRINT")?;
    let (copies, one) = rest.split_once(',')?;
    if one != "1" {
        return None;
    }
    let value: u16 = copies.parse().ok()?;
    (1..=999).contains(&value).then_some(value)
}

fn strip_command<'a>(line: &'a str, command: &str) -> Option<&'a str> {
    let rest = line.get(command.len()..)?;
    if !line[..command.len()].eq_ignore_ascii_case(command) {
        return None;
    }
    let rest = rest.strip_prefix(|ch: char| ch.is_ascii_whitespace())?;
    Some(rest.trim())
}

fn ascii(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| *byte as char).collect()
}
