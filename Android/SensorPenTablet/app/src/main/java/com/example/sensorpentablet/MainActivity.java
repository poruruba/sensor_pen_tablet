package com.example.sensorpentablet;

import androidx.appcompat.app.AppCompatActivity;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.os.Bundle;
import android.os.Message;
import android.speech.RecognizerIntent;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.Toast;
import android.widget.ToggleButton;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.tasks.OnCompleteListener;
import com.google.android.gms.tasks.Task;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.os.ParcelUuid;
import android.bluetooth.le.AdvertiseCallback;
import android.widget.AdapterView.OnItemSelectedListener;

public class MainActivity extends Activity implements View.OnClickListener, UIHandler.Callback, TouchView.OnTouchEventListener, OnItemSelectedListener{
    public static final String TAG = "tag_sensorpentab";

    UIHandler handler;
    BluetoothGattService btGattService;
    BluetoothGattServer mBtGattServer;
    BluetoothManager mBleManager;
    BluetoothAdapter mBleAdapter;
    BluetoothLeAdvertiser mBtAdvertiser;
    BluetoothGattCharacteristic mWriteCharacteristic;
    BluetoothGattCharacteristic mReadCharacteristic;
    BluetoothGattCharacteristic mNotifyCharacteristic;
    BluetoothDevice mConnectedDevice;
    boolean mIsConnected = false;
    byte[] charValue = new byte[Const.UUID_VALUE_SIZE]; /* max 512 */
    byte[] notifyDescValue = new byte[2];
    byte[] recv_buffer = new byte[512];
    int recv_len = 0;
    int num_of_push = 5;

    ClipboardManager clipboardManager;
    SensorManager sensorManager;
    FusedLocationProviderClient fusedLocationClient;
    boolean isGyroscope = false;
    boolean isAccelerometer = false;
    boolean isMagnetic = false;

    private static final String[] spin_items = {"None", "Push", "Touch", "2Touch"};
    private static final int fnButtonIds[] = { R.id.btn_fn1, R.id.btn_fn2, R.id.btn_fn3, R.id.btn_fn4, R.id.btn_fn5 };
    private static final int pushButtonIds[] = { R.id.btn_push1, R.id.btn_push2, R.id.btn_push3, R.id.btn_push4, R.id.btn_push5 };

    private static final int REQUEST_PERMISSION_LOCATION = 1000;
    private static final int REQUEST_RECOGNITION = 1001;
    private static final int UIMSG_TOAST = 2001;
    private static final int UIMSG_MODE = 2002;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        setContentView(R.layout.activity_main);
//        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        Log.d(TAG,"onCreate");

        handler = new UIHandler(this);

        clipboardManager = (ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);
        sensorManager = (SensorManager)getSystemService(SENSOR_SERVICE);

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        LocationRequest locationRequest = new LocationRequest();
        locationRequest.setPriority(LocationRequest.PRIORITY_HIGH_ACCURACY);

        Button btn;
        btn = findViewById(R.id.btn_copy);
        btn.setOnClickListener(this);
        btn = findViewById(R.id.btn_qrscan);
        btn.setOnClickListener(this);
        btn = findViewById(R.id.btn_location);
        btn.setOnClickListener(this);
        btn = findViewById(R.id.btn_recog);
        btn.setOnClickListener(this);

        Spinner spinner = findViewById(R.id.spin_mode);
        ArrayAdapter<String> adapter = new ArrayAdapter<>( this, android.R.layout.simple_spinner_item, spin_items );
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinner.setAdapter(adapter);
        spinner.setOnItemSelectedListener(this);

        ToggleButton toggle;
        toggle = findViewById(R.id.tgl_ctrl);
        toggle.setOnClickListener(this);
        toggle = findViewById(R.id.tgl_magnetic);
        toggle.setOnClickListener(this);
        toggle = findViewById(R.id.tgl_gyro);
        toggle.setOnClickListener(this);
        toggle = findViewById(R.id.tgl_accel);
        toggle.setOnClickListener(this);
        for( int i = 0 ; i < fnButtonIds.length ; i++ ){
            btn = findViewById(fnButtonIds[i]);
            btn.setOnClickListener(this);
        }
        for(int i = 0; i < pushButtonIds.length ; i++ ){
            btn = findViewById(pushButtonIds[i]);
            btn.setOnClickListener(this);
        }

        TouchView touchview;
        touchview = findViewById(R.id.view_touch);
        touchview.setOnTouchEventLister(0, this);
        touchview = findViewById(R.id.view_touch1);
        touchview.setOnTouchEventLister(1, this);
        touchview = findViewById(R.id.view_touch2);
        touchview.setOnTouchEventLister(2, this);

        mBleManager = (BluetoothManager) getSystemService(Context.BLUETOOTH_SERVICE);
        if( mBleManager != null ) {
            mBleAdapter = mBleManager.getAdapter();
            if (mBleAdapter != null)
                prepareBle();
        }
    }

    @Override
    protected void onResume(){
        super.onResume();

        if(isGyroscope)
            sensorStart(Sensor.TYPE_GYROSCOPE);
        if( isAccelerometer )
            sensorStart(Sensor.TYPE_ACCELEROMETER);
        if( isMagnetic )
            sensorStart(Sensor.TYPE_MAGNETIC_FIELD);
    }

    @Override
    protected void onPause(){
        super.onPause();

        sensorStop(Sensor.TYPE_GYROSCOPE);
        sensorStop(Sensor.TYPE_ACCELEROMETER);
        sensorStop(Sensor.TYPE_MAGNETIC_FIELD);
    }

    @Override
    public boolean handleMessage(Message message) {
        switch (message.what) {
            case UIHandler.MSG_ID_INT:{
                if( message.arg1 == UIMSG_MODE ){
                    if( message.arg2 == Const.MODE_PANEL_PUSH)
                        setButtonEnable((Integer)message.obj);
                    Spinner spin;
                    spin = findViewById(R.id.spin_mode);
                    spin.setSelection(message.arg2);
                    selectPanel(spin_items[message.arg2]);
                }
                break;
            }
            case UIHandler.MSG_ID_TEXT:{
                if( message.arg1 == UIMSG_TOAST ){
                    Toast.makeText(this, (String)message.obj, Toast.LENGTH_SHORT).show();
                }
            }
        }
        return false;
    }

    @Override
    public void onClick(View view) {
        int id = view.getId();
        switch(id){
            case R.id.tgl_magnetic:{
                ToggleButton tgl;
                tgl = findViewById(R.id.tgl_magnetic);
                setSensorEnable(Sensor.TYPE_MAGNETIC_FIELD, tgl.isChecked());
                break;
            }
            case R.id.tgl_gyro:{
                ToggleButton tgl;
                tgl = findViewById(R.id.tgl_gyro);
                setSensorEnable(Sensor.TYPE_GYROSCOPE, tgl.isChecked());
                break;
            }
            case R.id.tgl_accel:{
                ToggleButton tgl;
                tgl = findViewById(R.id.tgl_accel);
                setSensorEnable(Sensor.TYPE_ACCELEROMETER, tgl.isChecked());
                break;
            }
            case R.id.tgl_ctrl: {
                LinearLayout layout;
                layout = findViewById(R.id.layout_ctrl);
                if( layout.getVisibility() != View.VISIBLE)
                    layout.setVisibility(View.VISIBLE);
                else
                    layout.setVisibility(View.INVISIBLE);
                break;
            }
            case R.id.btn_copy: sendCopy(); break;
            case R.id.btn_qrscan: startQrScan(); break;
            case R.id.btn_location: getLocation(); break;
            case R.id.btn_recog: doRecognize(); break;
            default: sendButton(id); break;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        IntentResult result = IntentIntegrator.parseActivityResult(requestCode, resultCode, data);
        if(result != null) {
            if(result.getContents() != null)
                sendQrcode(result.getContents());
            return;
        }

        super.onActivityResult(requestCode, resultCode, data);
        if(requestCode == REQUEST_RECOGNITION && resultCode == RESULT_OK) {
            ArrayList<String> candidates = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if( candidates.size() > 0 )
                sendText(Const.TYPE_TEXT_RECOGNITION, candidates.get(0) );
        }
    }

    @Override
    public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
        Spinner spinner = (Spinner)parent;
        String item = (String)spinner.getSelectedItem();
        selectPanel(item);
    }

    public void onNothingSelected(AdapterView<?> parent) {
        // do nothing
    }

    @Override
    public void onTouchEvent(TouchView.TouchViewEvent event) {
        Log.d(TAG,"onTouchEvent : " + event.action + ", " + event.targetId);
        for( int i = 0 ; i < event.pointers.length ; i++ )
            Log.d(TAG,"\t[" + i + "] " + event.pointers[i].pointerid + " (" + event.pointers[i].x + "," + event.pointers[i].y + ")");
        int float_unit = Float.SIZE / Byte.SIZE;
        int int_unit = Integer.SIZE / Byte.SIZE;
        byte[] send_buffer = new byte[2 + 2 * int_unit + 1 + event.pointers.length * (int_unit + float_unit * 2)];
        send_buffer[0] = Const.RSP_TOUCH_EVENT;
        send_buffer[1] = (byte)event.id;
        setIntBytes(send_buffer, 2, event.action);
        setIntBytes(send_buffer, 2 + int_unit, event.targetId);
        send_buffer[2 + 2 * int_unit] = (byte)event.pointers.length;
        for( int i = 0 ; i < event.pointers.length ; i++ ){
            setIntBytes(send_buffer, 2 + 2 * int_unit + 1 + i * (int_unit + 2 * float_unit), event.pointers[i].pointerid);
            setFloatBytes(send_buffer, 2 + 2 * int_unit + 1 + i * (int_unit + 2 * float_unit) + int_unit, event.pointers[i].x);
            setFloatBytes(send_buffer, 2 + 2 * int_unit + 1 + i * (int_unit + 2 * float_unit) + int_unit + float_unit, event.pointers[i].y);
        }
        sendBuffer(send_buffer, send_buffer.length);
    }

    private void prepareBle(){
        mBtGattServer = mBleManager.openGattServer(this, mGattServerCallback);

        btGattService = new BluetoothGattService(Const.UUID_SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);

        mWriteCharacteristic = new BluetoothGattCharacteristic(Const.UUID_WRITE, BluetoothGattCharacteristic.PROPERTY_WRITE, BluetoothGattCharacteristic.PERMISSION_WRITE);
        btGattService.addCharacteristic(mWriteCharacteristic);
        mReadCharacteristic = new BluetoothGattCharacteristic(Const.UUID_READ, BluetoothGattCharacteristic.PROPERTY_READ, BluetoothGattCharacteristic.PERMISSION_READ);
        btGattService.addCharacteristic(mReadCharacteristic);
        mNotifyCharacteristic = new BluetoothGattCharacteristic(Const.UUID_NOTIFY, BluetoothGattCharacteristic.PROPERTY_NOTIFY, BluetoothGattCharacteristic.PERMISSION_READ);
        btGattService.addCharacteristic(mNotifyCharacteristic);
        BluetoothGattDescriptor dataDescriptor = new BluetoothGattDescriptor(Const.UUID_DESC, BluetoothGattDescriptor.PERMISSION_WRITE | BluetoothGattDescriptor.PERMISSION_READ);
        mNotifyCharacteristic.addDescriptor(dataDescriptor);
        mBtGattServer.addService(btGattService);

        startBleAdvertising();
    }

    private void startBleAdvertising(){
        mBtAdvertiser = mBleAdapter.getBluetoothLeAdvertiser();
        if( mBtAdvertiser == null ){
            Toast.makeText(this, "BLE Peripheralモードが使用できません。", Toast.LENGTH_SHORT).show();
            return;
        }

        AdvertiseData.Builder dataBuilder = new AdvertiseData.Builder();
        dataBuilder.setIncludeTxPowerLevel(true);
        dataBuilder.addServiceUuid(new ParcelUuid(Const.UUID_SERVICE));

        AdvertiseSettings.Builder settingsBuilder = new AdvertiseSettings.Builder();
        settingsBuilder.setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_BALANCED);
        settingsBuilder.setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM);
        settingsBuilder.setTimeout(0);
        settingsBuilder.setConnectable(true);

        AdvertiseData.Builder respBuilder = new AdvertiseData.Builder();
        respBuilder.setIncludeDeviceName(true);

        mBtAdvertiser.startAdvertising(settingsBuilder.build(), dataBuilder.build(), respBuilder.build(), new AdvertiseCallback(){
            @Override
            public void onStartSuccess(AdvertiseSettings settingsInEffect) {
                Log.d(TAG, "onStartSuccess");
            }
            @Override
            public void onStartFailure(int errorCode) {
                Log.d(TAG, "onStartFailure");
            }
        });
    }

    private BluetoothGattServerCallback mGattServerCallback = new BluetoothGattServerCallback() {
        private int cap = Const.CAP_CLIPBORAD | Const.CAP_PANEL | Const.CAP_MAGNETIC | Const.CAP_LOCATION | Const.CAP_GYROSCOPE |
                Const.CAP_ACCELEROMETER | Const.CAP_BUTTON | Const.CAP_QRCODE | Const.CAP_RECOGNITION | Const.CAP_TOAST;
        private byte[] readValue = new byte[]{ (byte)((Const.UUID_VALUE_SIZE >> 8) & 0xff), (byte)(Const.UUID_VALUE_SIZE & 0xff),
                (byte)((cap >> 24) & 0xff), (byte)((cap >> 16) & 0xff), (byte)((cap >> 8) & 0xff), (byte)((cap >> 0) & 0xff) };
        private byte expected_slot;
        private int expected_len = 0;

        @Override
        public void onMtuChanged (BluetoothDevice device, int mtu){
            Log.d(TAG, "onMtuChanged(" + mtu + ")");
        }

        @Override
        public void onConnectionStateChange(android.bluetooth.BluetoothDevice device, int status, int newState) {
            Log.d(TAG, "onConnectionStateChange");

            if(newState == BluetoothProfile.STATE_CONNECTED){
                mConnectedDevice = device;
                mIsConnected = true;
                Log.d(TAG, "STATE_CONNECTED:" + device.toString());
            }
            else{
                mIsConnected = false;
                Log.d(TAG, "Unknown STATE:" + newState);
            }
        }

        public void onCharacteristicReadRequest(android.bluetooth.BluetoothDevice device, int requestId, int offset, BluetoothGattCharacteristic characteristic) {
            Log.d(TAG, "onCharacteristicReadRequest");

            if( characteristic.getUuid().compareTo(Const.UUID_READ) == 0) {
                mBtGattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, readValue);
            }else{
                mBtGattServer.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null );
            }
        }

        public void onCharacteristicWriteRequest(android.bluetooth.BluetoothDevice device, int requestId, BluetoothGattCharacteristic characteristic, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            Log.d(TAG, "onCharacteristicWriteRequest");

            if( characteristic.getUuid().compareTo(Const.UUID_WRITE) == 0 ){
                if( expected_len > 0 && value[0] != expected_slot )
                    expected_len = 0;
                if( expected_len == 0 ) {
                    if (value[0] != (byte)0x83) {
                        mBtGattServer.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null);
                        return;
                    }
                    recv_len = 0;
                    expected_len = (((value[1] << 8) & 0x00ff) | (value[2] & 0x00ff));
                    System.arraycopy(value, 3, recv_buffer, recv_len, value.length - 3);
                    recv_len += value.length - 3;
                    expected_slot = 0x00;
                }else{
                    System.arraycopy(value, 1, recv_buffer, recv_len, value.length - 1);
                    recv_len += value.length - 1;
                    expected_slot++;
                }

                mBtGattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null);

                if( recv_len >= expected_len ) {
                    processCommand();
                    expected_len = 0;
                }
            }else{
                mBtGattServer.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null);
            }
        }

        public void onDescriptorReadRequest(BluetoothDevice device, int requestId, int offset, BluetoothGattDescriptor descriptor) {
            Log.d(TAG, "onDescriptorReadRequest");

            if( descriptor.getUuid().compareTo(Const.UUID_DESC) == 0 ) {
                mBtGattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, notifyDescValue);
            }
        }

        public void onDescriptorWriteRequest(BluetoothDevice device, int requestId, BluetoothGattDescriptor descriptor, boolean preparedWrite, boolean responseNeeded, int offset, byte[] value) {
            Log.d(TAG, "onDescriptorWriteRequest");

            if( descriptor.getUuid().compareTo(Const.UUID_DESC) == 0 ) {
                notifyDescValue[0] = value[0];
                notifyDescValue[1] = value[1];

                mBtGattServer.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null);
            }
        }
    };

    private boolean isNotification(){
        return (notifyDescValue[0] & 0x01) != 0x00;
    }

    private void sendAck(){
        byte[] send_buffer = new byte[]{ Const.RSP_ACK };
        sendBuffer(send_buffer, send_buffer.length);
    }

    public void sendBuffer(byte[] send_buffer, int send_len){
        if( !isNotification() )
            return;

        int offset = 0;
        int slot = 0x00;
        int packet_size = 0;
        byte[] value = charValue;

        do{
            if(offset == 0){
                packet_size = send_len - offset;
                if( packet_size >= (Const.UUID_VALUE_SIZE - 3) ) {
                    packet_size = Const.UUID_VALUE_SIZE - 3;
                }else{
                    value = new byte[packet_size + 3];
                }
                value[0] = (byte)0x83;
                value[1] = (byte)((send_len >> 8) & 0xff);
                value[2] = (byte)(send_len & 0xff);
                System.arraycopy(send_buffer, offset, value, 3, packet_size);

                offset += packet_size;
                packet_size += 3;
            }else{
                packet_size = send_len - offset;
                if( packet_size >= (Const.UUID_VALUE_SIZE - 1) ){
                    packet_size = Const.UUID_VALUE_SIZE - 1;
                }else{
                    value = new byte[packet_size + 1];
                }
                value[0] = (byte)slot++;
                System.arraycopy(send_buffer, offset, value, 1, packet_size);

                offset += packet_size;
                packet_size += 1;
            }
            mNotifyCharacteristic.setValue(value);
            mBtGattServer.notifyCharacteristicChanged(mConnectedDevice, mNotifyCharacteristic, false);
        }while(packet_size >= Const.UUID_VALUE_SIZE);
    }

    private void processCommand(){
        switch( recv_buffer[0] ){
            case Const.CMD_TOAST:{
                try{
                    int len = ((recv_buffer[1] << 8) & 0x00ff) | (recv_buffer[2] & 0x00ff);
                    String text = new String(Arrays.copyOfRange(recv_buffer, 3, 3 + len), "UTF-8");
                    handler.sendUIMessage(UIHandler.MSG_ID_TEXT, UIMSG_TOAST, text);
                }catch(Exception ex){
                    Toast.makeText(this, ex.getMessage(), Toast.LENGTH_LONG).show();
                }
                break;
            }
            case Const.CMD_PASTE:{
                try{
                    int len = ((recv_buffer[1] << 8) & 0x00ff) | (recv_buffer[2] & 0x00ff);
                    String text = new String(Arrays.copyOfRange(recv_buffer, 3, 3 + len), "UTF-8");
                    setPaste(text);
                }catch(Exception ex){
                    Toast.makeText(this, ex.getMessage(), Toast.LENGTH_LONG).show();
                }
                break;
            }
            case Const.CMD_LOCATION: {
                getLocation();
                break;
            }
            case Const.CMD_PANEL_MODE: {
                int value = ( recv_buffer[1] == Const.MODE_PANEL_PUSH ) ? (recv_buffer[2] & 0x00ff) : 0x00;
                handler.sendUIMessage(UIHandler.MSG_ID_INT, UIMSG_MODE, recv_buffer[1] & 0x00ff, new Integer(value));
                break;
            }
            case Const.CMD_RECOGNITION: {
                doRecognize();
                break;
            }
            case Const.CMD_SENSOR_MASK:{
                setSensorEnable(Sensor.TYPE_MAGNETIC_FIELD, (recv_buffer[1] & 0x01) != 0x00 );
                setSensorEnable(Sensor.TYPE_GYROSCOPE, (recv_buffer[1] & 0x02) != 0x00 );
                setSensorEnable(Sensor.TYPE_ACCELEROMETER, (recv_buffer[1] & 0x04) != 0x00 );
                break;
            }
        }
        sendAck();
    }

    private void setSensorEnable(int type, boolean enable){
        if( type == Sensor.TYPE_MAGNETIC_FIELD ) {
            isMagnetic = enable;
        }else if( type == Sensor.TYPE_GYROSCOPE){
            isGyroscope = enable;
        }else if( type == Sensor.TYPE_ACCELEROMETER ){
            isAccelerometer = enable;
        }
        if (enable)
            sensorStart(type);
        else
            sensorStop(type);
    }

    private void sensorStart(int type){
        if( sensorManager == null )
            return;

        if( type == Sensor.TYPE_MAGNETIC_FIELD ) {
            Sensor sensor = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD);
            if (sensor != null) {
                sensorManager.registerListener(sensorListnerMagnetic, sensor, SensorManager.SENSOR_DELAY_NORMAL);
            }
        }else if( type == Sensor.TYPE_GYROSCOPE ){
            Sensor sensor = sensorManager.getDefaultSensor(Sensor.TYPE_GYROSCOPE);
            if (sensor != null) {
                sensorManager.registerListener( sensorListnerGyro,  sensor, SensorManager.SENSOR_DELAY_NORMAL);
            }
        }else if( type == Sensor.TYPE_ACCELEROMETER){
            Sensor sensor = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (sensor != null) {
                sensorManager.registerListener( sensorListnerAccel,  sensor, SensorManager.SENSOR_DELAY_NORMAL);
            }
        }
    }

    private void sensorStop(int type){
        if( sensorManager == null )
            return;

        if( type == Sensor.TYPE_MAGNETIC_FIELD ) {
            sensorManager.unregisterListener(sensorListnerMagnetic);
        }else if( type == Sensor.TYPE_GYROSCOPE ){
            sensorManager.unregisterListener(sensorListnerGyro);
        }else if( type == Sensor.TYPE_ACCELEROMETER){
            sensorManager.unregisterListener(sensorListnerAccel);
        }
    }

    private void setButtonEnable(int num){
        num_of_push = num;

        Button btn;
        int i;
        for( i = 0 ; i < num ; i++ ){
            btn = findViewById(pushButtonIds[i]);
            btn.setVisibility(View.VISIBLE);
        }
        for(; i < pushButtonIds.length ; i++ ){
            btn = findViewById(pushButtonIds[i]);
            btn.setVisibility(View.GONE);
        }
    }

    private void sendButton(int id){
        byte code = 0x00;
        for(int i = 0; i < pushButtonIds.length ; i++ ){
            if( pushButtonIds[i] == id ) {
                code = (byte)(Const.BTNID_PUSH_BASE + i);
                break;
            }
        }
        if( code == 0x00 ) {
            for (int i = 0; i < fnButtonIds.length; i++) {
                if (fnButtonIds[i] == id) {
                    code = (byte) (Const.BTNID_FN_BASE + i);
                    break;
                }
            }
        }

        byte[] send_buffer = new byte[2];
        send_buffer[0] = Const.RSP_BUTTON_EVENT;
        send_buffer[1] = code;
        sendBuffer(send_buffer, send_buffer.length);
    }

    private void getLocation() {
        if (fusedLocationClient == null)
            return;

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED){
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_FINE_LOCATION}, REQUEST_PERMISSION_LOCATION);
        }else {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                fusedLocationClient.getLastLocation().addOnCompleteListener(this, new OnCompleteListener<Location>() {
                    @Override
                    public void onComplete(@NonNull Task<Location> task) {
                        Location location = task.getResult();
                        sendLocation(location.getLatitude(), location.getLongitude());
                    }
                });
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults){
        if( requestCode == REQUEST_PERMISSION_LOCATION )
            if (grantResults[0] == PackageManager.PERMISSION_GRANTED)
                getLocation();
    }

    private SensorEventListener sensorListnerMagnetic = new SensorEventListener(){
        @Override
        public void onSensorChanged(SensorEvent sensorEvent) {
            switch( sensorEvent.sensor.getType() ){
                case Sensor.TYPE_MAGNETIC_FIELD:{
                    int unit = Float.SIZE / Byte.SIZE;
                    byte[] send_buffer = new byte[1 + 3 * unit];
                    send_buffer[0] = Const.RSP_MAGNETIC;
                    setFloatBytes(send_buffer, 1, sensorEvent.values[0]);
                    setFloatBytes(send_buffer, 1 + unit, sensorEvent.values[1]);
                    setFloatBytes(send_buffer, 1 + 2 * unit, sensorEvent.values[2]);
                    sendBuffer(send_buffer, send_buffer.length);
                    break;
                }
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int i) {
            // do nothieng
        }
    };

    private SensorEventListener sensorListnerGyro = new SensorEventListener(){
        @Override
        public void onSensorChanged(SensorEvent sensorEvent) {
            switch( sensorEvent.sensor.getType() ){
                case Sensor.TYPE_GYROSCOPE:{
                    int unit = Float.SIZE / Byte.SIZE;
                    byte[] send_buffer = new byte[1 + 3 * unit];
                    send_buffer[0] = Const.RSP_GYROSCOPE;
                    setFloatBytes(send_buffer, 1, sensorEvent.values[0]);
                    setFloatBytes(send_buffer, 1 + unit, sensorEvent.values[1]);
                    setFloatBytes(send_buffer, 1 + 2 * unit, sensorEvent.values[2]);
                    sendBuffer(send_buffer, send_buffer.length);
                    break;
                }
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int i) {
            // do nothieng
        }
    };

    private SensorEventListener sensorListnerAccel = new SensorEventListener(){
        @Override
        public void onSensorChanged(SensorEvent sensorEvent) {
            switch( sensorEvent.sensor.getType() ){
                case Sensor.TYPE_ACCELEROMETER:{
                    int unit = Float.SIZE / Byte.SIZE;
                    byte[] send_buffer = new byte[1 + 3 * unit];
                    send_buffer[0] = Const.RSP_ACCELEROMETER;
                    setFloatBytes(send_buffer, 1, sensorEvent.values[0]);
                    setFloatBytes(send_buffer, 1 + unit, sensorEvent.values[1]);
                    setFloatBytes(send_buffer, 1 + 2 * unit, sensorEvent.values[2]);
                    sendBuffer(send_buffer, send_buffer.length);
                    break;
                }
            }
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int i) {
            // do nothieng
        }
    };

    public static int setIntBytes(byte[] buffer, int offset, int value){
        int arraySize = Integer.SIZE / Byte.SIZE;
        ByteBuffer bytebuffer = ByteBuffer.allocate(arraySize);
        bytebuffer.order(ByteOrder.BIG_ENDIAN);
        byte[] array = bytebuffer.putInt(value).array();

        System.arraycopy(array, 0, buffer, offset, arraySize);

        return arraySize;
    }

    public static int setFloatBytes(byte[] buffer, int offset, float value){
        int arraySize = Float.SIZE / Byte.SIZE;
        ByteBuffer bytebuffer = ByteBuffer.allocate(arraySize);
        bytebuffer.order(ByteOrder.BIG_ENDIAN);
        byte[] array = bytebuffer.putFloat(value).array();

        System.arraycopy(array, 0, buffer, offset, arraySize);

        return arraySize;
    }

    public static int setDoubleBytes(byte[] buffer, int offset, double value){
        int arraySize = Double.SIZE / Byte.SIZE;
        ByteBuffer bytebuffer = ByteBuffer.allocate(arraySize);
        bytebuffer.order(ByteOrder.BIG_ENDIAN);
        byte[] array = bytebuffer.putDouble(value).array();

        System.arraycopy(array, 0, buffer, offset, arraySize);

        return arraySize;
    }

    private void sendQrcode(String content){
        Toast.makeText(this, "Scanned: " + content, Toast.LENGTH_LONG).show();
        sendText(Const.TYPE_TEXT_QRCODE, content);
    }

    private void sendLocation(double lat, double lng){
        Toast.makeText(this, "onComplete : (" + lat + "," + lng + ")", Toast.LENGTH_LONG ).show();
        Log.d(TAG, "onComplete : (" + lat + "," + lng + ")");
        int unit = Double.SIZE / Byte.SIZE;
        byte[] send_buffer = new byte[1 + 2 * unit];
        send_buffer[0] = Const.RSP_LOCATION;
        setDoubleBytes(send_buffer, 1, lat);
        setDoubleBytes(send_buffer, 1 + unit, lng);
        sendBuffer(send_buffer, send_buffer.length);
    }

    private void setPaste(String text){
        if( clipboardManager == null )
            return;

        clipboardManager.setPrimaryClip(ClipData.newPlainText("", text));
        handler.sendUIMessage(UIHandler.MSG_ID_TEXT, UIMSG_TOAST, "Receive Clipboard");
    }

    private void sendText(byte type, String text){
        try {
            byte[] text_bin = text.getBytes("UTF-8");
            byte[] send_buffer = new byte[4 + text_bin.length];
            send_buffer[0] = Const.RSP_TEXT;
            send_buffer[1] = type;
            send_buffer[2] = (byte) ((text_bin.length >> 8) & 0xff);
            send_buffer[3] = (byte) (text_bin.length & 0xff);
            System.arraycopy(text_bin, 0, send_buffer, 4, text_bin.length);
            sendBuffer(send_buffer, send_buffer.length);
        }catch(Exception ex){
            Toast.makeText(this, ex.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void sendCopy(){
        if( clipboardManager == null )
            return;

        ClipData cd = clipboardManager.getPrimaryClip();
        if(cd != null){
            ClipData.Item item = cd.getItemAt(0);
            Toast.makeText(this, item.getText().toString(), Toast.LENGTH_LONG).show();
            sendText(Const.TYPE_TEXT_COPY, item.getText().toString());
        }
    }

    private void startQrScan(){
        new IntentIntegrator(this).initiateScan();
    }

    private void doRecognize(){
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.JAPAN.toString() );
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 100);
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "音声を入力");
        startActivityForResult(intent, REQUEST_RECOGNITION);
    }

    private void selectPanel(String item){
        LinearLayout layout;
        if( item.equals("None") ){
            layout = findViewById(R.id.layout_push);
            layout.setVisibility(View.GONE);
            layout = findViewById(R.id.layout_touch);
            layout.setVisibility(View.GONE);
            layout = findViewById(R.id.layout_2touch);
            layout.setVisibility(View.GONE);

            byte[] send_buffer = new byte[2];
            send_buffer[0] = Const.RSP_PANEL_CHANGE;
            send_buffer[1] = Const.MODE_PANEL_NONE;
            sendBuffer(send_buffer, send_buffer.length);
        }else if( item.equals("Push") ){
            layout = findViewById(R.id.layout_push);
            layout.setVisibility(View.VISIBLE);
            layout = findViewById(R.id.layout_touch);
            layout.setVisibility(View.GONE);
            layout = findViewById(R.id.layout_2touch);
            layout.setVisibility(View.GONE);

            byte[] send_buffer = new byte[3];
            send_buffer[0] = Const.RSP_PANEL_CHANGE;
            send_buffer[1] = Const.MODE_PANEL_PUSH;
            send_buffer[2] = (byte)num_of_push;
            sendBuffer(send_buffer, send_buffer.length);
        }else if( item.equals("Touch") ){
            layout = findViewById(R.id.layout_push);
            layout.setVisibility(View.GONE);
            layout = findViewById(R.id.layout_touch);
            layout.setVisibility(View.VISIBLE);
            layout = findViewById(R.id.layout_2touch);
            layout.setVisibility(View.GONE);

            int int_unit = Integer.SIZE / Byte.SIZE;
            byte[] send_buffer = new byte[3 + 2 * int_unit];
            send_buffer[0] = Const.RSP_PANEL_CHANGE;
            send_buffer[1] = Const.MODE_PANEL_TOUCH;
            send_buffer[2] = 1;
            TouchView view;
            view = findViewById(R.id.view_touch);
            setIntBytes(send_buffer, 3, view.getWidth());
            setIntBytes(send_buffer, 3 + int_unit, view.getHeight());
            sendBuffer(send_buffer, send_buffer.length);
        }else if( item.equals("2Touch") ){
            layout = findViewById(R.id.layout_push);
            layout.setVisibility(View.GONE);
            layout = findViewById(R.id.layout_touch);
            layout.setVisibility(View.GONE);
            layout = findViewById(R.id.layout_2touch);
            layout.setVisibility(View.VISIBLE);

            int int_unit = Integer.SIZE / Byte.SIZE;
            byte[] send_buffer = new byte[3 + 4 * int_unit];
            send_buffer[0] = Const.RSP_PANEL_CHANGE;
            send_buffer[1] = Const.MODE_PANEL_TOUCH2;
            send_buffer[2] = 2;
            TouchView view;
            view = findViewById(R.id.view_touch1);
            setIntBytes(send_buffer, 3, view.getWidth());
            setIntBytes(send_buffer, 3 + int_unit, view.getHeight());
            view = findViewById(R.id.view_touch2);
            setIntBytes(send_buffer, 3 + 2 * int_unit, view.getWidth());
            setIntBytes(send_buffer, 3 + 3 * int_unit, view.getHeight());
            sendBuffer(send_buffer, send_buffer.length);
        }
    }
}
