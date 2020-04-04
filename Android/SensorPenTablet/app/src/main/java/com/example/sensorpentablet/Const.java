package com.example.sensorpentablet;

import java.util.UUID;

public class Const {
    public static final byte CMD_PASTE = (byte)0x01;
    public static final byte CMD_LOCATION = (byte)0x03;
    public static final byte CMD_PANEL_MODE = (byte)0x08;
    public static final byte CMD_TOAST = (byte)0x0c;
    public static final byte CMD_RECOGNITION = (byte)0x0d;

    public static final byte RSP_ACK = (byte)0x00;
    public static final byte RSP_PANEL_CHANGE = (byte)0x19;
    public static final byte RSP_TEXT = (byte)0x11;
    public static final byte RSP_MAGNETIC = (byte)0x12;
    public static final byte RSP_LOCATION = (byte)0x13;
    public static final byte RSP_GYROSCOPE = (byte)0x14;
    public static final byte RSP_ACCELEROMETER = (byte)0x15;
    public static final byte RSP_TOUCH_EVENT = (byte)0x17;
    public static final byte RSP_BUTTON_EVENT = (byte)0x18;

    public static final byte TYPE_TEXT_COPY = 0x01;
    public static final byte TYPE_TEXT_QRCODE = 0x02;
    public static final byte TYPE_TEXT_RECOGNITION = 0x03;

    public static final byte MODE_PANEL_NONE = (byte)0x00;
    public static final byte MODE_PANEL_PUSH = (byte)0x01;
    public static final byte MODE_PANEL_TOUCH = (byte)0x02;
    public static final byte MODE_PANEL_TOUCH2 = (byte)0x03;

    public static final byte BTNID_PUSH_BASE    = (byte)0x10;
    public static final byte BTNID_FN_BASE     = (byte)0x20;

    public static final int CAP_CLIPBORAD = 0x00000001;
    public static final int CAP_PANEL = 0x00000002;
    public static final int CAP_MAGNETIC = 0x00000004;
    public static final int CAP_LOCATION = 0x00000008;
    public static final int CAP_GYROSCOPE = 0x00000010;
    public static final int CAP_ACCELEROMETER = 0x00000020;
    public static final int CAP_BUTTON = 0x00000040;
    public static final int CAP_QRCODE = 0x00000080;
    public static final int CAP_RECOGNITION = 0x00000100;
    public static final int CAP_TOAST = 0x00000200;

    public static final int UUID_VALUE_SIZE = 20;

    public static final UUID UUID_SERVICE = UUID.fromString("08030900-7d3b-4ebf-94e9-18abc4cebede");
    public static final UUID UUID_WRITE = UUID.fromString("08030901-7d3b-4ebf-94e9-18abc4cebede");
    public static final UUID UUID_READ = UUID.fromString("08030902-7d3b-4ebf-94e9-18abc4cebede");
    public static final UUID UUID_NOTIFY = UUID.fromString("08030903-7d3b-4ebf-94e9-18abc4cebede");
    public static final UUID UUID_DESC = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
}
