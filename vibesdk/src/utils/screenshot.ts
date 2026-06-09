import html2canvas from 'html2canvas-pro';

export interface ScreenshotOptions {
  quality?: number;
  format?: 'png' | 'jpeg' | 'webp';
  excludeElements?: string[]; // CSS selectors to exclude
  scale?: number;
  width?: number;
  height?: number;
  element?: HTMLElement; // Optional specific element to capture
}

export interface ScreenshotResult {
  dataUrl: string;
  blob: Blob;
  metadata: {
    timestamp: number;
    url: string;
    viewport: { width: number; height: number };
    userAgent: string;
  };
}

/**
 * Captures a screenshot of the current page with advanced options
 * Automatically handles hiding specified elements during capture
 */
export async function captureScreenshot(options: ScreenshotOptions = {}): Promise<ScreenshotResult> {
  const {
    quality = 0.8,
    format = 'jpeg',
    excludeElements = [],
    scale = 1,
    width,
    height,
    element
  } = options;

  // Store original styles of elements to hide
  const elementsToHide: Array<{ element: HTMLElement; originalStyle: string }> = [];
  
  try {
    // Hide specified elements
    excludeElements.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        const htmlEl = el as HTMLElement;
        elementsToHide.push({
          element: htmlEl,
          originalStyle: htmlEl.style.display
        });
        htmlEl.style.display = 'none';
      });
    });

    // Capture screenshot of the specified element or the entire body
    const targetElement = element || document.body;
    const canvas = await html2canvas(targetElement, {
      useCORS: true,
      allowTaint: false,
      scale,
      width,
      height,
      backgroundColor: '#ffffff',
      logging: false,
      ignoreElements: (element) => {
        // Additional element filtering if needed
        return element.classList.contains('screenshot-exclude');
      }
    });

    // Convert to desired format
    const dataUrl = canvas.toDataURL(`image/${format}`, quality);
    
    // Convert to blob for easier handling
    const blob = await new Promise<Blob>((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob!);
      }, `image/${format}`, quality);
    });

    return {
      dataUrl,
      blob,
      metadata: {
        timestamp: Date.now(),
        url: window.location.href,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        userAgent: navigator.userAgent
      }
    };
  } finally {
    // Restore original styles
    elementsToHide.forEach(({ element, originalStyle }) => {
      element.style.display = originalStyle;
    });
  }
}

/**
 * Captures a screenshot specifically for debug purposes
 * Automatically excludes debug panels and overlays
 */
export async function captureDebugScreenshot(): Promise<ScreenshotResult> {
  return captureScreenshot({
    quality: 0.8,
    format: 'jpeg',
    excludeElements: [
      '[data-debug-panel]',
      '[data-overlay]',
      '.debug-panel',
      '.modal-overlay',
      '.toast-container',
      '.notification'
    ],
    scale: 1
  });
}

/**
 * Captures a screenshot for deployment documentation
 * High quality capture for production use
 */
export async function captureDeploymentScreenshot(): Promise<ScreenshotResult> {
  return captureScreenshot({
    quality: 0.9,
    format: 'png',
    excludeElements: [
      '[data-debug-panel]',
      '[data-overlay]',
      '.debug-panel'
    ],
    scale: 1
  });
}

/**
 * Auto screenshot system for tracking page states
 */
export class AutoScreenshotSystem {
  private enabled = false;
  private lastScreenshot: ScreenshotResult | null = null;
  private screenshotHistory: ScreenshotResult[] = [];
  private maxHistory = 10;

  constructor(private onScreenshot?: (screenshot: ScreenshotResult) => void) {}

  enable() {
    this.enabled = true;
    this.setupListeners();
  }

  disable() {
    this.enabled = false;
  }

  private setupListeners() {
    // Capture on page navigation
    window.addEventListener('popstate', () => {
      if (this.enabled) {
        this.captureAuto('navigation');
      }
    });

    // Capture on significant DOM changes (debounced)
    let domChangeTimeout: NodeJS.Timeout;
    const observer = new MutationObserver(() => {
      if (this.enabled) {
        clearTimeout(domChangeTimeout);
        domChangeTimeout = setTimeout(() => {
          this.captureAuto('dom_change');
        }, 2000);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: false
    });
  }

  private async captureAuto(trigger: string) {
    try {
      const screenshot = await captureScreenshot({
        quality: 0.6,
        format: 'jpeg',
        scale: 0.5,
        excludeElements: [
          '[data-debug-panel]',
          '[data-overlay]'
        ]
      });

      this.lastScreenshot = screenshot;
      this.screenshotHistory.push(screenshot);
      
      // Keep only recent screenshots
      if (this.screenshotHistory.length > this.maxHistory) {
        this.screenshotHistory.shift();
      }

      this.onScreenshot?.(screenshot);
      
      console.log(`Auto screenshot captured: ${trigger}`, {
        timestamp: screenshot.metadata.timestamp,
        url: screenshot.metadata.url
      });
    } catch (error) {
      console.error('Auto screenshot failed:', error);
    }
  }

  getHistory(): ScreenshotResult[] {
    return [...this.screenshotHistory];
  }

  getLastScreenshot(): ScreenshotResult | null {
    return this.lastScreenshot;
  }
}

// Global auto screenshot system instance
export const autoScreenshotSystem = new AutoScreenshotSystem();
