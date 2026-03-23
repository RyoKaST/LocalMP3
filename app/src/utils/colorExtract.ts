const FALLBACK_COLORS = ["#1a1a2e", "#16213e", "#0f3460"];
const CANVAS_SIZE = 64;

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

function brightness(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function extractDominantColors(imageUrl: string): Promise<string[]> {
  if (!imageUrl) {
    return Promise.resolve([...FALLBACK_COLORS]);
  }

  return new Promise<string[]>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    const timeout = setTimeout(() => {
      resolve([...FALLBACK_COLORS]);
    }, 5000);

    img.onload = () => {
      clearTimeout(timeout);
      try {
        const canvas = document.createElement("canvas");
        canvas.width = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve([...FALLBACK_COLORS]);
          return;
        }

        ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const data = imageData.data;

        const buckets: { r: number; g: number; b: number; count: number }[] = [
          { r: 0, g: 0, b: 0, count: 0 },
          { r: 0, g: 0, b: 0, count: 0 },
          { r: 0, g: 0, b: 0, count: 0 },
        ];

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          if (a < 10) continue;

          const br = brightness(r, g, b);
          let bucketIndex: number;
          if (br < 85) {
            bucketIndex = 0;
          } else if (br < 170) {
            bucketIndex = 1;
          } else {
            bucketIndex = 2;
          }

          buckets[bucketIndex].r += r;
          buckets[bucketIndex].g += g;
          buckets[bucketIndex].b += b;
          buckets[bucketIndex].count += 1;
        }

        const colors: string[] = [];
        for (const bucket of buckets) {
          if (bucket.count > 0) {
            colors.push(
              rgbToHex(
                bucket.r / bucket.count,
                bucket.g / bucket.count,
                bucket.b / bucket.count
              )
            );
          }
        }

        let idx = 0;
        while (colors.length < 2) {
          colors.push(FALLBACK_COLORS[idx]);
          idx++;
        }

        resolve(colors);
      } catch {
        resolve([...FALLBACK_COLORS]);
      }
    };

    img.onerror = () => {
      clearTimeout(timeout);
      resolve([...FALLBACK_COLORS]);
    };

    img.src = imageUrl;
  });
}
