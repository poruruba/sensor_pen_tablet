'use strict';

//var vConsole = new VConsole();

var bluetoothDevice = null;
var characteristics = new Map();

const UUID_SERVICE = '08030900-7d3b-4ebf-94e9-18abc4cebede';
const UUID_WRITE = "08030901-7d3b-4ebf-94e9-18abc4cebede";
const UUID_READ = "08030902-7d3b-4ebf-94e9-18abc4cebede";
const UUID_NOTIFY = "08030903-7d3b-4ebf-94e9-18abc4cebede";

const CMD_PASTE = 0x01;
const CMD_LOCATION = 0x03;
const CMD_PANEL_MODE = 0x08;
const CMD_TOAST = 0x0c;
const CMD_RECOGNITION = 0x0d;
const CMD_SENSOR_MASK = 0x0e;
const CMD_RAW = 0xff;

const RSP_ACK = 0x00;
const RSP_PANEL_CHANGE = 0x19;
const RSP_TEXT = 0x11;
const RSP_MAGNETIC = 0x12;
const RSP_LOCATION = 0x13;
const RSP_GYROSCOPE = 0x14;
const RSP_ACCELEROMETER = 0x15;
const RSP_TOUCH_EVENT = 0x17;
const RSP_BUTTON_EVENT = 0x18;
const RSP_RAW = 0xff;

const TYPE_TEXT_COPY = 0x01;
const TYPE_TEXT_QRCODE = 0x02;
const TYPE_TEXT_RECOGNITION = 0x03;

var PACKET_BUFFER_SIZE = 20;

var recv_buffer = new Uint8Array(512);
var recv_len = 0;
var expected_len = 0;
var expected_slot;

var encoder = new TextEncoder('utf-8');
var decoder = new TextDecoder('utf-8');

var vue_options = {
    el: "#top",
    data: {
        progress_title: '',

        deviceName: '',
        latitude: 0.0,
        longitude: 0.0,
        paste_toast: '',
        button_num: 5,
        panel: 0,
        width: 0,
        height: 0,
        action: 0,
        targetId: 0,
        pointers: [],
        width1: 0,
        height1: 0,
        action1: 0,
        targetId1: 0,
        pointers1: [],
        width2: 0,
        height2: 0,
        action2: 0,
        targetId2: 0,
        pointers2: [],
        accel: null,
        gyro: null,
        magnetic: null,
        copy: '',
        qrcode: '',
        recognition: '',
        fn_count: [0, 0, 0, 0, 0],
        push_count: [0, 0, 0, 0, 0],
        capability: 0,
        is_magnetic: false,
        is_gyroscope: false,
        is_accelerometer: false,
    },
    computed: {
    },
    methods: {
        device_open: async function(){
            try{
                if( bluetoothDevice != null ){
                    if( bluetoothDevice.gatt.connected )
                        bluetoothDevice.gatt.disconnect();
                }
                console.log('Execute : requestDevice');
                var device = await navigator.bluetooth.requestDevice({
                    filters: [{services:[ UUID_SERVICE ]}]
                });

                console.log("requestDevice OK");
                characteristics.clear();
                bluetoothDevice = device;
                bluetoothDevice.addEventListener('gattserverdisconnected', this.onDisconnect);
                this.deviceName = bluetoothDevice.name;

                var server = await bluetoothDevice.gatt.connect()
                console.log('Execute : getPrimaryService');
                var service = await server.getPrimaryService(UUID_SERVICE);
                console.log('Execute : getCharacteristic');

                await this.setCharacteristic(service, UUID_WRITE);
                await this.setCharacteristic(service, UUID_READ);
                await this.setCharacteristic(service, UUID_NOTIFY);
                await this.startNotify(UUID_NOTIFY);
                console.log('device_open done');

                await this.readChar(UUID_READ);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        device_init: async function(){
            console.log('device_init done');
        },
        onDisconnect: function(event){
            console.log('onDisconnect');
            characteristics.clear();
            if( bluetoothDevice != null ){
                if( bluetoothDevice.gatt.connected )
                    bluetoothDevice.gatt.disconnect();
            }
        },
        setCharacteristic: async function(service, characteristicUuid) {
            var characteristic = await service.getCharacteristic(characteristicUuid)
            console.log('setCharacteristic : ' + characteristicUuid);
            characteristics.set(characteristicUuid, characteristic);
			characteristic.addEventListener('characteristicvaluechanged', this.onDataChanged);
            return service;
        },
        startNotify: function(uuid) {
            if( characteristics.get(uuid) === undefined )
                throw "Not Connected";
    
            console.log('Execute : startNotifications');
            return characteristics.get(uuid).startNotifications();
        },
        writeChar: function(uuid, array_value) {
            if( characteristics.get(uuid) === undefined )
                throw "Not Connected";
    
            console.log('Execute : writeValue');
            let data = Uint8Array.from(array_value);
            return characteristics.get(uuid).writeValue(data);
        },
        readChar: function(uuid) {
            if( characteristics.get(uuid) === undefined )
                throw "Not Connected";
    
            console.log('Execute : readValue');
            return characteristics.get(uuid).readValue();
        },
        onDataChanged: async function(event){
            console.log('onDataChanged');
    
            let characteristic = event.target;
            if( characteristic.uuid == UUID_READ){
                let value = dataview_to_uint8array(characteristic.value);
                PACKET_BUFFER_SIZE = ((value[0] & 0x00ff) << 8) | value[1];
                
                this.capability = ((value[2] & 0x00ff) << 24) | ((value[3] & 0x00ff) << 16) | ((value[4] & 0x00ff) << 8) | value[5];

                await this.device_init();
            }else
            if( characteristic.uuid == UUID_NOTIFY ){
                let value = dataview_to_uint8array(characteristic.value);

                if( expected_len > 0 && value[0] != expected_slot )
                    expected_len = 0;
            
                if( expected_len == 0 ){
                    if( value[0] != 0x83 )
                        return;
                    recv_len = 0;
                    expected_len = (value[1] << 8) | value[2];
                    array_copy(recv_buffer, recv_len, value, 3, value.length - 3);
                    recv_len += value.length - 3;
                    expected_slot = 0;
                    if( recv_len < expected_len )
                        return;
                }else{
                    array_copy(recv_buffer, recv_len, value, 1, value.length - 1);
                    recv_len += value.length - 1;
                    expected_slot++;
                    if( recv_len < expected_len )
                        return;
                }
                expected_len = 0;

                await this.processResponse(recv_buffer, recv_len);
            }
        },
        processResponse: async function(recv_buffer, recv_len){
            switch(recv_buffer[0]){
                case RSP_LOCATION: {
                    var dv = new DataView(recv_buffer.buffer, 1, 16);
                    this.latitude = dv.getFloat64(0, false);
                    this.longitude = dv.getFloat64(8, false);
                    break;
                }
                case RSP_TOUCH_EVENT: {
                    var id = recv_buffer[1];
                    var dv = new DataView(recv_buffer.buffer, 2, 8);
                    var action = dv.getInt32(0, false);
                    var targetId = dv.getInt32(4, false);
                    var count = recv_buffer[10];
                    var list = [];
                    for( var i = 0 ; i < count ; i++ ){
                        var dv = new DataView(recv_buffer.buffer, 11 + i * 4 * 3, 4 * 3);
                        var pointer = { pointerId: dv.getInt32(0, false), x: dv.getFloat32(4, false), y: dv.getFloat32(8, false)};
                        list.push(pointer);
                    }
                    if( id == 0 ){
                        this.action = action;
                        this.targetId = targetId;
                        this.pointers = list;
                    }else if( id == 1 ){
                        this.action1 = action;
                        this.targetId1 = targetId;
                        this.pointers1 = list;
                    }else if( id == 2 ){
                        this.action2 = action;
                        this.targetId2 = targetId;
                        this.pointers2 = list;
                    }
                    break;
                }
                case RSP_MAGNETIC: {
                    var dv = new DataView(recv_buffer.buffer, 1, 12);
                    var magnetic = { x: dv.getFloat32(0, false), y: dv.getFloat32(4, false), z: dv.getFloat32(8, false) };
                    this.magnetic = magnetic;
                    break;
                }
                case RSP_GYROSCOPE: {
                    var dv = new DataView(recv_buffer.buffer, 1, 12);
                    var gyro = { x: dv.getFloat32(0, false), y: dv.getFloat32(4, false), z: dv.getFloat32(8, false) };
                    this.gyro = gyro;
                    break;
                }
                case RSP_ACCELEROMETER: {
                    var dv = new DataView(recv_buffer.buffer, 1, 12);
                    var accel = { x: dv.getFloat32(0, false), y: dv.getFloat32(4, false), z: dv.getFloat32(8, false) };
                    this.accel = accel;
                    break;
                }
                case RSP_TEXT: {
                    var type = recv_buffer[1];
                    var len = ((recv_buffer[2] & 0x00ff) << 8 ) | recv_buffer[3];
                    var text = decoder.decode(recv_buffer.slice(4, 4 + len));
                    switch( type ){
                        case TYPE_TEXT_COPY: this.copy = text; break;
                        case TYPE_TEXT_QRCODE: this.qrcode = text; break;
                        case TYPE_TEXT_RECOGNITION: this.recognition = text; break;
                    }
                    break;
                }
                case RSP_BUTTON_EVENT: {
                    if( recv_buffer[1] >= 0x10 && recv_buffer[1] <= 0x14 ){
                        this.push_count[recv_buffer[1] - 0x10]++;
                        this.push_count = object_clone(this.push_count);
                    }
                    if( recv_buffer[1] >= 0x20 && recv_buffer[1] <= 0x24 ){
                        this.fn_count[recv_buffer[1] - 0x20]++;
                        this.fn_count = object_clone(this.fn_count);
                    }
                    break;
                }
                case RSP_PANEL_CHANGE: {
                    if( recv_buffer[1] == 0x02 ){
                        var dv = new DataView(recv_buffer.buffer, 3, 8);
                        this.width = dv.getInt32(0, false);
                        this.height = dv.getInt32(4, false);
                    }else if( recv_buffer[1] == 0x03 ){
                        var dv = new DataView(recv_buffer.buffer, 3, 16);
                        this.width1 = dv.getInt32(0, false);
                        this.height1 = dv.getInt32(4, false);
                        this.width2 = dv.getInt32(8, false);
                        this.height2 = dv.getInt32(12, false);
                    }
                    break;
                }
            }
        },
        get_location: async function(){
            try{
                var send_buffer = [CMD_LOCATION];
                await this.sendBuffer(send_buffer, send_buffer.length);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        send_copy: async function(){
            try{
                var text_bin = encoder.encode(this.paste_toast);
                var send_buffer = new Uint8Array(1 + 2 + text_bin.length);
                send_buffer[0] = CMD_PASTE;
                send_buffer[1] = (text_bin.length >> 8) & 0xff;
                send_buffer[2] = text_bin.length & 0xff;
                array_copy(send_buffer, 3, text_bin, 0, text_bin.length);
                await this.sendBuffer(send_buffer, send_buffer.length);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        send_toast: async function(){
            try{
                var text_bin = encoder.encode(this.paste_toast);
                var send_buffer = new Uint8Array(1 + 2 + text_bin.length);
                send_buffer[0] = CMD_TOAST;
                send_buffer[1] = (text_bin.length >> 8) & 0xff;
                send_buffer[2] = text_bin.length & 0xff;
                array_copy(send_buffer, 3, text_bin, 0, text_bin.length);
                await this.sendBuffer(send_buffer, send_buffer.length);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        set_button: async function(){
            try{
                var send_buffer = [CMD_PANEL_MODE, 0x01, this.button_num];
                await this.sendBuffer(send_buffer, send_buffer.length);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        set_panel: async function(){
            try{
                var send_buffer = [CMD_PANEL_MODE, this.panel, this.button_num];
                await this.sendBuffer(send_buffer, send_buffer.length);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        set_mask: async function(){
            try{
                var mask = 0x00;
                if( this.is_magnetic ) mask |= 0x01;
                if( this.is_gyroscope ) mask |= 0x02;
                if( this.is_accelerometer ) mask |= 0x04;
                var send_buffer = [CMD_SENSOR_MASK, mask];
                await this.sendBuffer(send_buffer, send_buffer.length);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        sendBuffer: async function(send_buffer, len){
            var offset = 0;
            var slot = 0;
            var packet_size = 0;
            var value = new Array(PACKET_BUFFER_SIZE);
            do{
                if( offset == 0){
                    packet_size = len - offset;
                    if( packet_size >= (PACKET_BUFFER_SIZE - 3) )
                        packet_size = PACKET_BUFFER_SIZE - 3;
                    else
                        value = new Array(packet_size + 3);
                  
                    value[0] = 0x83;
                    value[1] = (len >> 8) & 0xff;
                    value[2] = len & 0xff;
                    array_copy(value, 3, send_buffer, offset, packet_size);

                    offset += packet_size;
                    packet_size += 3;
                }else{
                    packet_size = len - offset;
                    if( packet_size >= (PACKET_BUFFER_SIZE - 1) )
                        packet_size = PACKET_BUFFER_SIZE - 1;
                    else
                        value = new Array(packet_size + 1);

                    value[0] = slot++;
                    array_copy(value, 1, send_buffer, offset, packet_size);
          
                    offset += packet_size;
                    packet_size += 1;
                }

                await this.writeChar(UUID_WRITE, value);
            }while(packet_size >= PACKET_BUFFER_SIZE);            
        }
    },
    created: function(){
    },
    mounted: function(){
        proc_load();
    }
};
vue_add_methods(vue_options, methods_utils);
var vue = new Vue( vue_options );

function dataview_to_uint8array(array){
	var result = new Uint8Array(array.byteLength);
	for( var i = 0 ; i < array.byteLength ; i++ )
		result[i] = array.getUint8(i);
		
	return result;
}

function array_copy( dest, dest_offset, src, src_offset, length ){
    for( var i = 0 ; i < length ; i++ )
        dest[dest_offset + i] = src[src_offset + i];
    
    return dest;
}

function object_clone(object){
    return JSON.parse(JSON.stringify(object));   
}