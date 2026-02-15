/**
 * SLUI SlideToggle
 * Ported from monolithic ui.js for API compatibility.
 */

/**
 * SlideToggle - iOS-style slide switch with left/right labels
 * @param {Object} options
 */
export function SlideToggle(options = {}) {
    const {
        labelLeft = 'Off',
        labelRight = 'On',
        value = false,
        onChange = null,
        size = 'medium',
        className = ''
    } = options;

    let isRight = value;

    const container = document.createElement('div');
    container.className = `sl-slide-toggle sl-slide-toggle-${size} ${className}`.trim();

    const leftLabel = document.createElement('span');
    leftLabel.className = 'sl-slide-toggle-label sl-slide-toggle-label-left';
    leftLabel.textContent = labelLeft;

    const track = document.createElement('div');
    track.className = 'sl-slide-toggle-track';

    const thumb = document.createElement('div');
    thumb.className = 'sl-slide-toggle-thumb';
    track.appendChild(thumb);

    const rightLabel = document.createElement('span');
    rightLabel.className = 'sl-slide-toggle-label sl-slide-toggle-label-right';
    rightLabel.textContent = labelRight;

    container.appendChild(leftLabel);
    container.appendChild(track);
    container.appendChild(rightLabel);

    function updateState() {
        container.classList.toggle('active', isRight);
        leftLabel.classList.toggle('active', !isRight);
        rightLabel.classList.toggle('active', isRight);
    }

    updateState();

    track.addEventListener('click', () => {
        isRight = !isRight;
        updateState();
        if (onChange) onChange(isRight);
    });

    leftLabel.addEventListener('click', () => {
        if (isRight) {
            isRight = false;
            updateState();
            if (onChange) onChange(isRight);
        }
    });

    rightLabel.addEventListener('click', () => {
        if (!isRight) {
            isRight = true;
            updateState();
            if (onChange) onChange(isRight);
        }
    });

    container.getValue = () => isRight;
    container.setValue = (newValue, triggerCallback = false) => {
        if (isRight !== newValue) {
            isRight = newValue;
            updateState();
            if (triggerCallback && onChange) onChange(isRight);
        }
    };

    return container;
}

