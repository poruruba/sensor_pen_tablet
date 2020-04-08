'use strict';

class SensorPenTablet{
  constructor(){
    this.init_const();

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
    this.eventsSensor = [];
    this.eventsTouch = [];
    this.eventsClick = [];
    this.eventsData = [];
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
        filters: [{services:[ this.UUID_SERVICE ]}]
    });

    console.log("requestDevice OK");
    this.characteristics.clear();
    this.bluetoothDevice = device;
    var _this_ = this;
    this.bluetoothDevice.addEventListener('gattserverdisconnected', function(event){ _this_.onDisconnect(event); } );
//    this.bluetoothDevice.addEventListener('gattserverdisconnected', this.onDisconnect);

    var server = await this.bluetoothDevice.gatt.connect()
    console.log('Execute : getPrimaryService');
    var service = await server.getPrimaryService(this.UUID_SERVICE);
    console.log('Execute : getCharacteristic');

    await this.setCharacteristic(service, this.UUID_WRITE);
    await this.setCharacteristic(service, this.UUID_READ);
    await this.setCharacteristic(service, this.UUID_NOTIFY);
    await this.startNotify(this.UUID_NOTIFY);
    console.log('device_open done');

    await this.readChar(this.UUID_READ);

    return this.bluetoothDevice.name;
  }

  deviceClose(){
    if( this.bluetoothDevice != null && this.bluetoothDevice.gatt.connected )
      this.bluetoothDevice.gatt.disconnect();
  }

  async onDisconnect(event){
    console.log('onDisconnect');
    this.isInitialized = false;
    this.characteristics.clear();
    await this.fireEvent(this.eventsInit, 1, {});
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
    if( characteristic.uuid == this.UUID_READ){
        let value = this.dataview_to_uint8array(characteristic.value);
        this.PACKET_BUFFER_SIZE = ((value[0] & 0x00ff) << 8) | value[1];

        if( !this.isInitialized ){
          this.isInitialized = true;
          var cap = ((value[2] & 0x00ff) << 24) | ((value[3] & 0x00ff) << 16) | ((value[4] & 0x00ff) << 8) | value[5]; 
          await this.fireEvent(this.eventsInit, 0, {cap: cap});
        }
    }else
    if( characteristic.uuid == this.UUID_NOTIFY ){
      let value = this.dataview_to_uint8array(characteristic.value);

      if( this.expected_len > 0 && value[0] != this.expected_slot )
        this.expected_len = 0;
    
      if( this.expected_len == 0 ){
            if( value[0] != 0x83 )
                return;
            this.recv_len = 0;
            this.expected_len = (value[1] << 8) | value[2];
            this.array_copy(this.recv_buffer, this.recv_len, value, 3, value.length - 3);
            this.recv_len += value.length - 3;
            this.expected_slot = 0;
            if( this.recv_len < this.expected_len )
                return;
        }else{
            this.array_copy(this.recv_buffer, this.recv_len, value, 1, value.length - 1);
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
      case this.RSP_TEXT: {
        var len = ((recv_buffer[2] & 0x00ff) << 8 ) | recv_buffer[3];
        var text = this.decoder.decode(recv_buffer.slice(4, 4 + len));
        var event = {
          type: recv_buffer[1],
          text: text,
        };
        await this.fireEvent(this.eventsData, this.RSP_TEXT, event);
        break;
      }
      case this.RSP_LOCATION: {
        var dv = new DataView(recv_buffer.buffer, 1, 16);
        var lat = dv.getFloat64(0, false);
        var lng = dv.getFloat64(8, false);
        var event = {
          lat: lat,
          lng: lng,
        };
        await this.fireEvent(this.eventsData, this.RSP_LOCATION, event);
        break;
      }
      case this.RSP_MAGNETIC:
      case this.RSP_GYROSCOPE:
      case this.RSP_ACCELEROMETER:
      {
        var dv = new DataView(recv_buffer.buffer, 1, 12);
        var x = dv.getFloat32(0, false);
        var y = dv.getFloat32(4, false);
        var z = dv.getFloat32(8, false);
        var event = {
          x: x,
          y: y,
          z: z,
        };
        await this.fireEvent(this.eventsSensor, recv_buffer[0], event);
        break;
      }
      case this.RSP_TOUCH_EVENT: {
          var id = recv_buffer[1];
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
            id: id,
            action: action,
            targetId: targetId,
            pointers: pointers
          };
          await this.fireEvent(this.eventsTouch, this.RSP_TOUCH_EVENT, event);

          break;
      }
      case this.RSP_BUTTON_EVENT: {
        await this.fireEvent(this.eventsClick, this.RSP_BUTTON_EVENT, { button: recv_buffer[1] });
        break;
      }
      case this.RSP_PANEL_CHANGE: {
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
          await this.fireEvent(this.eventsChange, this.RSP_PANEL_CHANGE, event);
          break;
      }
    }
  }

  async fireEvent(events, type, event){
    for( var i = 0 ; i < events.length ; i++ )
      await events[i](type, event);
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
              this.array_copy(value, 3, send_buffer, offset, packet_size);

              offset += packet_size;
              packet_size += 3;
          }else{
              packet_size = len - offset;
              if( packet_size >= (this.PACKET_BUFFER_SIZE - 1) )
                  packet_size = this.PACKET_BUFFER_SIZE - 1;
              else
                  value = new Array(packet_size + 1);

              value[0] = slot++;
              this.array_copy(value, 1, send_buffer, offset, packet_size);
    
              offset += packet_size;
              packet_size += 1;
          }

          await this.writeChar(this.UUID_WRITE, value);
      }while(packet_size >= this.PACKET_BUFFER_SIZE);            
  }

  addEventListener(type, listener){
    var events;
    switch( type ){
      case 'sensor' : events = this.eventsSensor; break;
      case 'touch': events = this.eventsTouch; break;
      case 'change' : events = this.eventsChange; break;
      case 'data': events = this.eventsData; break;
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
      case 'sensor' : events = this.eventsSensor; break;
      case 'touch' : events = this.eventsTouch; break;
      case 'change' : events = this.eventsChange; break;
      case 'data' : events = this.eventsData; break;
      case 'click' : events = this.eventsClick; break;
      case 'init' : events = this.eventsInit; break;
      default:
        return;
    }
    var index = events.indexOf(listener);
    if( index >= 0 )
      events.splice(index, 1);
  }

  async requestRecognition(){
    var send_buffer = [this.CMD_RECOGNITION];
    await this.sendBuffer(send_buffer, send_buffer.length);
  }

  async requestLocation(){
    var send_buffer = [this.CMD_LOCATION];
    await this.sendBuffer(send_buffer, send_buffer.length);
  }
  
  async sendClipboard(text){
    var text_bin = this.encoder.encode(text);
    var send_buffer = new Uint8Array(1 + 2 + text_bin.length);
    send_buffer[0] = this.CMD_PASTE;
    send_buffer[1] = (text_bin.length >> 8) & 0xff;
    send_buffer[2] = text_bin.length & 0xff;
    this.array_copy(send_buffer, 3, text_bin, 0, text_bin.length);
    await this.sendBuffer(send_buffer, send_buffer.length);
  }

  async sendToast(text){
    var text_bin = this.encoder.encode(text);
    var send_buffer = new Uint8Array(1 + 2 + text_bin.length);
    send_buffer[0] = this.CMD_TOAST;
    send_buffer[1] = (text_bin.length >> 8) & 0xff;
    send_buffer[2] = text_bin.length & 0xff;
    this.array_copy(send_buffer, 3, text_bin, 0, text_bin.length);
    await this.sendBuffer(send_buffer, send_buffer.length);
  }

  async setButton(num){
    var send_buffer = [this.CMD_PANEL_MODE, 0x01, num];
    await this.sendBuffer(send_buffer, send_buffer.length);
  }
  
  async setPanel(panel, num = 0){
    var send_buffer = [this.CMD_PANEL_MODE, panel, num];
    await this.sendBuffer(send_buffer, send_buffer.length);
  }

  async setSensorMask(types){
    var send_buffer = [this.CMD_SENSOR_MASK, types];
    await this.sendBuffer(send_buffer, send_buffer.length);
  }

  init_const(){
    this.UUID_SERVICE = '08030900-7d3b-4ebf-94e9-18abc4cebede';
    this.UUID_WRITE = "08030901-7d3b-4ebf-94e9-18abc4cebede";
    this.UUID_READ = "08030902-7d3b-4ebf-94e9-18abc4cebede";
    this.UUID_NOTIFY = "08030903-7d3b-4ebf-94e9-18abc4cebede";
    
    this.CMD_PASTE = 0x01;
    this.CMD_LOCATION = 0x03;
    this.CMD_PANEL_MODE = 0x08;
    this.CMD_TOAST = 0x0c;
    this.CMD_RECOGNITION = 0x0d;
    this.CMD_SENSOR_MASK = 0x0e;
    this.CMD_RAW = 0xff;
    
    this.RSP_ACK = 0x00;
    this.RSP_PANEL_CHANGE = 0x19;
    this.RSP_TEXT = 0x11;
    this.RSP_MAGNETIC = 0x12;
    this.RSP_LOCATION = 0x13;
    this.RSP_GYROSCOPE = 0x14;
    this.RSP_ACCELEROMETER = 0x15;
    this.RSP_TOUCH_EVENT = 0x17;
    this.RSP_BUTTON_EVENT = 0x18;
    this.RSP_RAW = 0xff;
  }

  dataview_to_uint8array(array){
    var result = new Uint8Array(array.byteLength);
    for( var i = 0 ; i < array.byteLength ; i++ )
      result[i] = array.getUint8(i);
      
    return result;
  }
  
  array_copy( dest, dest_offset, src, src_offset, length ){
      for( var i = 0 ; i < length ; i++ )
          dest[dest_offset + i] = src[src_offset + i];
      
      return dest;
  }
}

