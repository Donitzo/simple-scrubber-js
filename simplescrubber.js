const BAR_COLOR = '#003680';
const PILL_COLOR = '#003680';
const TEXT_COLOR = '#fff';

const CONTROL_PADDING = 6;
const LINE_WIDTH = 3;

const PILL_HEIGHT = 20;
const PILL_MIN_WIDTH = 34;
const PILL_X_PADDING = 16;
const PILL_FONT = '12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';

const activeInputs = new WeakSet();

const overlay = {
    canvas: null,
    ctx: null,
    height: 0,
    width: 0,
};

const setInputValue = (input, value, shouldCommit) => {
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);

    const clampedValue = Math.min(Math.max(value, min), max);
    const roundedValue = Number(clampedValue.toFixed(15));
    
    input.value = String(roundedValue);

    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (shouldCommit) {
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }
};

const getViewport = () => {
    const viewport = window.visualViewport;

    if (viewport) {
        return {
            left: viewport.pageLeft,
            top: viewport.pageTop,
            width: viewport.width,
            height: viewport.height,
        };
    }

    return {
        left: window.scrollX,
        top: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
    };
};

const resizeOverlayCanvas = () => {
    const viewport = getViewport();
    const dpr = window.devicePixelRatio || 1;

    overlay.width = Math.round(viewport.width);
    overlay.height = Math.round(viewport.height);

    Object.assign(overlay.canvas.style, {
        left: `${Math.round(viewport.left)}px`,
        top: `${Math.round(viewport.top)}px`,
        width: `${Math.round(viewport.width)}px`,
        height: `${Math.round(viewport.height)}px`,
    });

    overlay.canvas.width = Math.round(viewport.width * dpr);
    overlay.canvas.height = Math.round(viewport.height * dpr);

    overlay.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
};

const drawScrubber = options => {
    const ctx = overlay.ctx;
    if (ctx === null) {
        return;
    }

    overlay.canvas.style.display = 'block';

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.font = PILL_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const controlRect = options.controlRect;
    const paddedRect = {
        left: controlRect.left - CONTROL_PADDING,
        right: controlRect.right + CONTROL_PADDING,
        top: controlRect.top - CONTROL_PADDING,
        bottom: controlRect.bottom + CONTROL_PADDING,
    };

    const value = String(options.value);
    const pillWidth = Math.max(
        PILL_MIN_WIDTH,
        Math.ceil(ctx.measureText(String(value)).width + PILL_X_PADDING)
    );

    ctx.strokeStyle = BAR_COLOR;
    ctx.lineWidth = LINE_WIDTH;

    let pillRect;
    let pillVisible;

    if (options.vertical) {
        const lineX = controlRect.left + controlRect.width / 2;
        const controlCenterY = controlRect.top + controlRect.height / 2;

        const side = options.y < controlCenterY ? -1 : 1;
        const anchorY = side < 0 ? paddedRect.top : paddedRect.bottom;

        pillRect = {
            left: lineX - pillWidth / 2,
            right: lineX + pillWidth / 2,
            top: options.y - PILL_HEIGHT / 2,
            bottom: options.y + PILL_HEIGHT / 2,
        };
        pillVisible = !(
            pillRect.left < paddedRect.right &&
            pillRect.right > paddedRect.left &&
            pillRect.top < paddedRect.bottom &&
            pillRect.bottom > paddedRect.top
        );
        const lineEndY = pillVisible
            ? side < 0
                ? pillRect.bottom
                : pillRect.top
            : side < 0
                ? Math.min(options.y, anchorY)
                : Math.max(options.y, anchorY);

        if (anchorY !== lineEndY) {
            ctx.beginPath();
            ctx.moveTo(lineX, anchorY);
            ctx.lineTo(lineX, lineEndY);
            ctx.stroke();
        }
    } else {
        const lineY = controlRect.top + controlRect.height / 2;
        const controlCenterX = controlRect.left + controlRect.width / 2;

        const side = options.x < controlCenterX ? -1 : 1;
        const anchorX = side < 0 ? paddedRect.left : paddedRect.right;

        pillRect = {
            left: options.x - pillWidth / 2,
            right: options.x + pillWidth / 2,
            top: lineY - PILL_HEIGHT / 2,
            bottom: lineY + PILL_HEIGHT / 2,
        };
        pillVisible = !(
            pillRect.left < paddedRect.right &&
            pillRect.right > paddedRect.left &&
            pillRect.top < paddedRect.bottom &&
            pillRect.bottom > paddedRect.top
        );
        const lineEndX = pillVisible
            ? side < 0
                ? pillRect.right
                : pillRect.left
            : side < 0
                ? Math.min(options.x, anchorX)
                : Math.max(options.x, anchorX);

        if (anchorX !== lineEndX) {
            ctx.beginPath();
            ctx.moveTo(anchorX, lineY);
            ctx.lineTo(lineEndX, lineY);
            ctx.stroke();
        }
    }

    if (pillVisible) {
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(
                pillRect.left,
                pillRect.top,
                pillRect.right - pillRect.left,
                pillRect.bottom - pillRect.top,
                PILL_HEIGHT / 2
            );
        } else {
            ctx.rect(
                pillRect.left,
                pillRect.top,
                pillRect.right - pillRect.left,
                pillRect.bottom - pillRect.top
            );
        }

        ctx.fillStyle = PILL_COLOR;
        ctx.fill();

        ctx.fillStyle = TEXT_COLOR;
        ctx.fillText(
            value,
            pillRect.left + (pillRect.right - pillRect.left) / 2,
            pillRect.top + (pillRect.bottom - pillRect.top) / 2
        );
    }
};

const attachScrubber = input => {
    if (activeInputs.has(input)) {
        return;
    }

    activeInputs.add(input);

    input.style.cursor = input.hasAttribute('data-scrubber-vertical') ? 'ns-resize' : 'ew-resize';
    input.style.touchAction = 'none';

    input.addEventListener('dragstart', event => {
        event.preventDefault();
    });

    input.addEventListener('pointerdown', event => {
        if (event.button !== 0 || input.disabled || input.readOnly) {
            return;
        }

        const pointerId = event.pointerId;
        const vertical = input.hasAttribute('data-scrubber-vertical');

        const startX = event.clientX;
        const startY = event.clientY;

        const startValue = Number(input.value || input.min || 0);
        const step = Number(input.step || 1);
        const pixelsPerStep = Number(input.dataset.scrubberPixelsPerStep);

        let dragged = false;
        let latestValue = startValue;

        input.focus();
        input.setPointerCapture(pointerId);

        drawScrubber({
            x: startX,
            y: startY,
            value: input.value || startValue,
            vertical,
            controlRect: input.getBoundingClientRect(),
        });

        const onPointerMove = moveEvent => {
            if (moveEvent.pointerId !== pointerId) {
                return;
            }

            const distance = vertical
                ? startY - moveEvent.clientY
                : moveEvent.clientX - startX;

            moveEvent.preventDefault();

            const stepsMoved = Math.round(distance / pixelsPerStep);
            const nextValue = startValue + stepsMoved * step;

            dragged = dragged || stepsMoved !== 0;

            if (latestValue !== nextValue) {
                latestValue = nextValue;

                setInputValue(input, nextValue, false);
            }

            drawScrubber({
                x: moveEvent.clientX,
                y: moveEvent.clientY,
                value: input.value,
                vertical,
                controlRect: input.getBoundingClientRect(),
            });
        };

        const onPointerUp = upEvent => {
            if (upEvent.pointerId !== pointerId) {
                return;
            }

            if (input.hasPointerCapture(pointerId)) {
                input.releasePointerCapture(pointerId);
            }

            input.removeEventListener('pointermove', onPointerMove);
            input.removeEventListener('pointerup', onPointerUp);
            input.removeEventListener('pointercancel', onPointerUp);
            input.removeEventListener('lostpointercapture', onPointerUp);

            if (dragged) {
                setInputValue(input, latestValue, true);
            }

            if (overlay.ctx !== null) {
                overlay.canvas.style.display = 'none';
            }
        };

        input.addEventListener('pointermove', onPointerMove);
        input.addEventListener('pointerup', onPointerUp);
        input.addEventListener('pointercancel', onPointerUp);
        input.addEventListener('lostpointercapture', onPointerUp);
    });
};

const createScrubbers = () => {
    document
        .querySelectorAll('input[type="number"][data-scrubber-pixels-per-step]')
        .forEach(attachScrubber);
};

window.createNumberScrubbers = createScrubbers;

window.addEventListener('load', () => {
    overlay.canvas = document.createElement('canvas');
    overlay.ctx = overlay.canvas.getContext('2d');

    Object.assign(overlay.canvas.style, {
        background: 'transparent',
        display: 'none',
        left: '0',
        top: '0',
        pointerEvents: 'none',
        position: 'absolute',
        zIndex: '100000',
    });

    document.body.appendChild(overlay.canvas);

    resizeOverlayCanvas();

    window.addEventListener('resize', resizeOverlayCanvas);
    window.addEventListener('scroll', resizeOverlayCanvas);
    
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resizeOverlayCanvas);
        window.visualViewport.addEventListener('scroll', resizeOverlayCanvas);
    }

    createScrubbers();
});
