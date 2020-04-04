'use strict';

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

class SensorPenTablet{
  constructor(){
    this.encoder = new TextEncoder('utf-8');
    this.decoder = new TextDecoder('utf-8');
    this.bluetoothDevice = null;
    this.characteristics = new Map();
    this.recv_buffer = new Uint8Array(512);
    this.recv_len = 0;
    this.expected_len = 0;
    this.expected_slot;
    this.width = 0;
    this.height = 0;
    this.eventsTouch = [];
    this.eventsClick = [];
    this.eventsText = [];
    this.eventTouch = [];
    this.eventsInit = [];
    this.eventsChange = [];
    this.isInitialized = false;

    this.PACKET_BUFFER_SIZE = 20;
  }

  async deviceOpen(){
    if( this.bluetoothDevice != null && this.bluetoothDevice.gatt.connected )
      this.bluetoothDevice.gatt.disconnect();

    console.log('Execute : requestDevice');
    var device = await navigator.bluetooth.requestDevice({
        filters: [{services:[ UUID_SERVICE ]}]
    });

    console.log("requestDevice OK");
    this.characteristics.clear();
    this.bluetoothDevice = device;
    var _this_ = this;
    this.bluetoothDevice.addEventListener('gattserverdisconnected', function(event){ _this_.onDisconnect(event); } );
//    this.bluetoothDevice.addEventListener('gattserverdisconnected', this.onDisconnect);

    var server = await this.bluetoothDevice.gatt.connect()
    console.log('Execute : getPrimaryService');
    var service = await server.getPrimaryService(UUID_SERVICE);
    console.log('Execute : getCharacteristic');

    await this.setCharacteristic(service, UUID_WRITE);
    await this.setCharacteristic(service, UUID_READ);
    await this.setCharacteristic(service, UUID_NOTIFY);
    await this.startNotify(UUID_NOTIFY);
    console.log('device_open done');

    await this.readChar(UUID_READ);

    return this.bluetoothDevice.name;
  }

  deviceClose(){
    if( this.bluetoothDevice != null && this.bluetoothDevice.gatt.connected )
      this.bluetoothDevice.gatt.disconnect();
  }

  onDisconnect(event){
    console.log('onDisconnect');
    this.isInitialized = false;
    this.characteristics.clear();
  }

  async setCharacteristic(service, characteristicUuid) {
    var characteristic = await service.getCharacteristic(characteristicUuid)
    console.log('setCharacteristic : ' + characteristicUuid);
    this.characteristics.set(characteristicUuid, characteristic);
    var _this_ = this;
    characteristic.addEventListener('characteristicvaluechanged', function(event){ _this_.onDataChanged(event); });
//    characteristic.addEventListener('characteristicvaluechanged', this.onDataChanged);
    return service;
  }

  startNotify(uuid) {
    if( this.characteristics.get(uuid) === undefined )
        throw "Not Connected";

    console.log('Execute : startNotifications');
    return this.characteristics.get(uuid).startNotifications();
  }

  writeChar(uuid, array_value) {
    if( this.characteristics.get(uuid) === undefined )
        throw "Not Connected";

    console.log('Execute : writeValue');
    let data = Uint8Array.from(array_value);
    return this.characteristics.get(uuid).writeValue(data);
  }
  
  readChar(uuid) {
    if( this.characteristics.get(uuid) === undefined )
        throw "Not Connected";

    console.log('Execute : readValue');
    return this.characteristics.get(uuid).readValue();
  }
  
  async onDataChanged(event){
    console.log('onDataChanged');

    let characteristic = event.target;
    if( characteristic.uuid == UUID_READ){
        let value = dataview_to_uint8array(characteristic.value);
        this.PACKET_BUFFER_SIZE = ((value[0] & 0x00ff) << 8) | value[1];

        if( !this.isInitialized ){
          this.isInitialized = true;
          var cap = ((value[2] & 0x00ff) << 24) | ((value[3] & 0x00ff) << 16) | ((value[4] & 0x00ff) << 8) | value[5]; 
          await this.fireEvent(this.eventsInit, {cap: cap});
        }
    }else
    if( characteristic.uuid == UUID_NOTIFY ){
        let value = dataview_to_uint8array(characteristic.value);

        if( this.expected_len > 0 && value[0] != this.expected_slot )
          this.expected_len = 0;
    
        if( this.expected_len == 0 ){
            if( value[0] != 0x83 )
                return;
            this.recv_len = 0;
            this.expected_len = (value[1] << 8) | value[2];
            array_copy(this.recv_buffer, this.recv_len, value, 3, value.length - 3);
            this.recv_len += value.length - 3;
            this.expected_slot = 0;
            if( this.recv_len < this.expected_len )
                return;
        }else{
            array_copy(this.recv_buffer, this.recv_len, value, 1, value.length - 1);
            this.recv_len += value.length - 1;
            this.expected_slot++;
            if( this.recv_len < this.expected_len )
                return;
        }
        this.expected_len = 0;

        await this.processResponse(this.recv_buffer, this.recv_len);
    }
  }
  
  async processResponse(recv_buffer, recv_len){
    switch(recv_buffer[0]){
      case RSP_TEXT: {
        var len = ((recv_buffer[2] & 0x00ff) << 8 ) | recv_buffer[3];
        var text = this.decoder.decode(recv_buffer.slice(4, 4 + len));
        var event = {
          type: recv_buffer[1],
          text: text,
        }
        await this.fireEvent(this.eventsText, event);
        break;
      }
      case RSP_TOUCH_EVENT: {
          var id = recv_buffer[1];
          if( id != 0 )
            return;
          var dv = new DataView(recv_buffer.buffer, 2, 8);
          var action = dv.getInt32(0, false);
          var targetId = dv.getInt32(4, false);
          var count = recv_buffer[10];
          var pointers = [];
          for( var i = 0 ; i < count ; i++ ){
              var dv = new DataView(recv_buffer.buffer, 11 + i * 4 * 3, 4 * 3);
              var pointer = { pointerId: dv.getInt32(0, false), x: dv.getFloat32(4, false), y: dv.getFloat32(8, false)};
              pointers.push(pointer);
          }

          var event = {
            action: action,
            targetId: targetId,
            pointers: pointers
          };
          await this.fireEvent(this.eventsTouch, event);

          break;
      }
      case RSP_BUTTON_EVENT: {
        await this.fireEvent(this.eventsClick, { button: recv_buffer[1] });
        break;
      }
      case RSP_PANEL_CHANGE: {
          var event = {
            panel: recv_buffer[1],
            size: [],
          };
          if( recv_buffer[1] == 0x02 ){
            var dv = new DataView(recv_buffer.buffer, 3, 8);
            event.size.push({ width: dv.getInt32(0, false), height: dv.getInt32(4, false)});
          }else if( recv_buffer[2] = 0x03 ){
            var dv = new DataView(recv_buffer.buffer, 3, 16);
            for( var i = 0 ; i < 2 ; i++ ){
              event.size.push({ width: dv.getInt32(i * 8, false), height: dv.getInt32(i * 8 + 4, false)});
            }
          }
          await this.fireEvent(this.eventsChange, event);
          break;
      }
    }
  }

  async fireEvent(events, event){
    for( var i = 0 ; i < events.length ; i++ )
      await events[i](event);
  }

  async sendBuffer(send_buffer, len){
      var offset = 0;
      var slot = 0;
      var packet_size = 0;
      var value = new Array(this.PACKET_BUFFER_SIZE);
      do{
          if( offset == 0){
              packet_size = len - offset;
              if( packet_size >= (this.PACKET_BUFFER_SIZE - 3) )
                  packet_size = this.PACKET_BUFFER_SIZE - 3;
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
              if( packet_size >= (this.PACKET_BUFFER_SIZE - 1) )
                  packet_size = this.PACKET_BUFFER_SIZE - 1;
              else
                  value = new Array(packet_size + 1);

              value[0] = slot++;
              array_copy(value, 1, send_buffer, offset, packet_size);
    
              offset += packet_size;
              packet_size += 1;
          }

          await this.writeChar(UUID_WRITE, value);
      }while(packet_size >= this.PACKET_BUFFER_SIZE);            
  }

  addEventListener(type, listener){
    var events;
    switch( type ){
      case 'touch': events = this.eventsTouch; break;
      case 'change' : events = this.eventsChange; break;
      case 'text': events = this.eventsText; break;
      case 'click': events = this.eventsClick; break;
      case 'init': events = this.eventsInit; break;
      default:
        return;
    }
      
    events.push(listener);
  }

  removeEventListener(type, listener){
    var events;
    switch( type ){
      case 'touch' : events = this.eventsTouch; break;
      case 'change' : events = this.eventsChange; break;
      case 'text' : events = this.eventsText; break;
      case 'click' : events = this.eventsClick; break;
      case 'init' : events = this.eventsInit; break;
      default:
        return;
    }
    var index = events.indexOf(listener);
    if( index >= 0 )
      events.splice(index, 1);
  }

  async getLocation(){
    var send_buffer = [CMD_LOCATION];
    await this.sendBuffer(send_buffer, send_buffer.length);
  }
  
  async sendClipboard(text){
    var text_bin = encoder.encode(text);
    var send_buffer = new Uint8Array(1 + 2 + text_bin.length);
    send_buffer[0] = CMD_PASTE;
    send_buffer[1] = (text_bin.length >> 8) & 0xff;
    send_buffer[2] = text_bin.length & 0xff;
    array_copy(send_buffer, 3, text_bin, 0, text_bin.length);
    await this.sendBuffer(send_buffer, send_buffer.length);
  }

  async sendToast(text){
    var text_bin = encoder.encode(text);
    var send_buffer = new Uint8Array(1 + 2 + text_bin.length);
    send_buffer[0] = CMD_TOAST;
    send_buffer[1] = (text_bin.length >> 8) & 0xff;
    send_buffer[2] = text_bin.length & 0xff;
    array_copy(send_buffer, 3, text_bin, 0, text_bin.length);
    await this.sendBuffer(send_buffer, send_buffer.length);
  }

  async setButton(num){
    var send_buffer = [CMD_PANEL_MODE, 0x01, num];
    await this.sendBuffer(send_buffer, send_buffer.length);
  }
  
  async setPanel(panel, num = 0){
    var send_buffer = [CMD_PANEL_MODE, panel, num];
    await this.sendBuffer(send_buffer, send_buffer.length);
  }
}

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