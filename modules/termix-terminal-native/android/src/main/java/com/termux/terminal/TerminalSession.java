package com.termux.terminal;

import java.util.UUID;

/**
 * A terminal session fed from a byte stream instead of a local process.
 * <p>
 * Termix change: upstream Termix starts a subprocess on a pty through JNI. Here the
 * app owns the transport (SSH), so output arrives through {@link #feed} and key
 * input leaves through the {@link Sink}. Must be used from the main thread.
 */
public final class TerminalSession extends TerminalOutput {

    /** Where key input and window size changes go. */
    public interface Sink {
        void onInput(byte[] data, int offset, int count);

        void onResize(int columns, int rows);
    }

    public final String mHandle = UUID.randomUUID().toString();

    TerminalEmulator mEmulator;

    TerminalSessionClient mClient;

    private final Sink mSink;
    private final Integer mTranscriptRows;
    private final byte[] mUtf8InputBuffer = new byte[5];
    private boolean mFinished;

    public String mSessionName;

    public TerminalSession(Integer transcriptRows, TerminalSessionClient client, Sink sink) {
        this.mTranscriptRows = transcriptRows;
        this.mClient = client;
        this.mSink = sink;
    }

    public void updateTerminalSessionClient(TerminalSessionClient client) {
        mClient = client;
        if (mEmulator != null) mEmulator.updateTerminalSessionClient(client);
    }

    public void updateSize(int columns, int rows, int cellWidthPixels, int cellHeightPixels) {
        if (mEmulator == null) {
            mEmulator = new TerminalEmulator(this, columns, rows, cellWidthPixels, cellHeightPixels, mTranscriptRows, mClient);
        } else {
            mEmulator.resize(columns, rows, cellWidthPixels, cellHeightPixels);
        }
        mSink.onResize(columns, rows);
    }

    /** Feeds output from the remote side into the emulator. */
    public void feed(byte[] data, int count) {
        if (mEmulator == null) return;
        mEmulator.append(data, count);
        notifyScreenUpdate();
    }

    public String getTitle() {
        return (mEmulator == null) ? null : mEmulator.getTitle();
    }

    @Override
    public void write(byte[] data, int offset, int count) {
        if (!mFinished) mSink.onInput(data, offset, count);
    }

    public void writeCodePoint(boolean prependEscape, int codePoint) {
        if (codePoint > 1114111 || (codePoint >= 0xD800 && codePoint <= 0xDFFF)) {
            throw new IllegalArgumentException("Invalid code point: " + codePoint);
        }

        int bufferPosition = 0;
        if (prependEscape) mUtf8InputBuffer[bufferPosition++] = 27;

        if (codePoint <= 0b1111111) {
            mUtf8InputBuffer[bufferPosition++] = (byte) codePoint;
        } else if (codePoint <= 0b11111111111) {
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b11000000 | (codePoint >> 6));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b10000000 | (codePoint & 0b111111));
        } else if (codePoint <= 0b1111111111111111) {
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b11100000 | (codePoint >> 12));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b10000000 | ((codePoint >> 6) & 0b111111));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b10000000 | (codePoint & 0b111111));
        } else {
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b11110000 | (codePoint >> 18));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b10000000 | ((codePoint >> 12) & 0b111111));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b10000000 | ((codePoint >> 6) & 0b111111));
            mUtf8InputBuffer[bufferPosition++] = (byte) (0b10000000 | (codePoint & 0b111111));
        }
        write(mUtf8InputBuffer, 0, bufferPosition);
    }

    public TerminalEmulator getEmulator() {
        return mEmulator;
    }

    protected void notifyScreenUpdate() {
        mClient.onTextChanged(this);
    }

    public void reset() {
        mEmulator.reset();
        notifyScreenUpdate();
    }

    /** Stops sending input, for when the remote side has closed. */
    public void finish() {
        mFinished = true;
        mClient.onSessionFinished(this);
    }

    public boolean isRunning() {
        return !mFinished;
    }

    @Override
    public void titleChanged(String oldTitle, String newTitle) {
        mClient.onTitleChanged(this);
    }

    @Override
    public void onCopyTextToClipboard(String text) {
        mClient.onCopyTextToClipboard(this, text);
    }

    @Override
    public void onPasteTextFromClipboard() {
        mClient.onPasteTextFromClipboard(this);
    }

    @Override
    public void onBell() {
        mClient.onBell(this);
    }

    @Override
    public void onColorsChanged() {
        mClient.onColorsChanged(this);
    }

    public int getPid() {
        return -1;
    }

    public String getCwd() {
        return null;
    }
}
