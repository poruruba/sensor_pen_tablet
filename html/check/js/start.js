'use strict';

//var vConsole = new VConsole();

var pentablet = new SensorPenTablet();

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
            pentablet.addEventListener("init", this.initListener);
            pentablet.addEventListener("change", this.changeListener);
            pentablet.addEventListener("touch", this.touchListener);
            pentablet.addEventListener("click", this.buttonListener);
            pentablet.addEventListener("data", this.dataListener);
            pentablet.addEventListener("sensor", this.sensorListener);

            try{
                this.progress_open();
                this.deviceName = await pentablet.deviceOpen();
            }catch(error){
                console.log(error);
                this.progress_close();
                alert(error);
            }
        },
        initListener: async function(type, event){
            if( type == 0){
                this.capability = event.cap;
                this.progress_close();
            }
        },
        changeListener: async function(type, event){
            if( event.panel == 2 ){
                this.width = event.size[0].width;
                this.height = event.size[0].height;
            }else if( event.panel = 3 ){
                this.width1 = event.size[0].width;
                this.height1 = event.size[0].height;
                this.width2 = event.size[1].width;
                this.height2 = event.size[1].height;
                    }
        },
        touchListener: async function(type, event){
            var id = event.id;
            var action = event.action;
            var targetId = event.targetId;
            var list = event.pointers;
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
        },
        buttonListener: function(type, event){
            var btn = event.button;
            if( btn >= 0x10 && btn <= 0x14 ){
                this.push_count[btn - 0x10]++;
                this.push_count = object_clone(this.push_count);
                }
            if( btn >= 0x20 && btn <= 0x24 ){
                this.fn_count[btn - 0x20]++;
                this.fn_count = object_clone(this.fn_count);
                }
        },
        dataListener: function(type, event){
            switch(type){
                case pentablet.RSP_LOCATION: {
                    this.latitude = event.lat;
                    this.longitude = event.lng;
                    break;
                }
                case pentablet.RSP_TEXT: {
                    var type = event.type;
                    switch( type ){
                        case 0x01: this.copy = event.text; break;
                        case 0x02: this.qrcode = event.text; break;
                        case 0x03: this.recognition = event.text; break;
                    }
                    break;
                }
                    }
        },
        sensorListener: function(type, event){
            switch(type){
                case pentablet.RSP_MAGNETIC: {
                    this.magnetic = { x: event.x, y: event.y, z: event.z };
                    break;
                }
                case pentablet.RSP_GYROSCOPE: {
                    this.gyro = { x: event.x, y: event.y, z: event.z };
                    break;
                    }
                case pentablet.RSP_ACCELEROMETER: {
                    this.accel = { x: event.x, y: event.y, z: event.z };
                    break;
                }
            }
        },
        get_location: async function(){
            try{
                await pentablet.requestLocation();
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        send_copy: async function(){
            try{
                await pentablet.sendClipboard(this.paste_toast);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        send_toast: async function(){
            try{
                await pentablet.sendToast(this.paste_toast);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        set_button: async function(){
            try{
                await pentablet.setButton(this.button_num);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        set_panel: async function(){
            try{
                await pentablet.setPanel(this.panel);
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
                await pentablet.setSensorMask(mask);
            }catch(error){
                console.log(error);
                alert(error);
            }
        },
        do_recognition: async function(){
            try{
                await pentablet.requestRecognition();
            }catch(error){
                console.log(error);
                alert(error);
                }
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

function object_clone(object){
    return JSON.parse(JSON.stringify(object));   
}