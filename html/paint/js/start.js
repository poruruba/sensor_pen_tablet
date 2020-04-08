'use strict';

//var vConsole = new VConsole();

const CANVAS_SIZE = 1000;

var pentablet = new SensorPenTablet();

var vue_options = {
    el: "#top",
    data: {
        progress_title: '',

        deviceName: '',
        original_width: 0,
        original_height: 0,
        prev_pointerId: -1,
        div: 0.0,
        canvas: null,
        context: null,
        capability: 0,
    },
    computed: {
    },
    methods: {
        device_open: async function(){
            pentablet.addEventListener("init", this.initListener);
            pentablet.addEventListener("change", this.changeListener);
            pentablet.addEventListener("touch", this.touchListener);
            pentablet.addEventListener("click", this.buttonListener);

            try{
                this.progress_open();
                this.deviceName = await pentablet.deviceOpen();
            }catch(error){
                this.progress_close();
            }
        },
        touchListener: async function(type, event){
            if( this.context != null ){
                if( event.id != 0 )
                    return;

                var action = event.action;
                var targetId = event.targetId;
                var pointers = event.pointers;
                if( action == 0){
                    this.prev_pointerId = targetId;
                    this.context.beginPath();
                    this.context.moveTo(Math.floor(pointers[0].x * this.div), Math.floor(pointers[0].y * this.div));
                }else if( action == 2 || action == 5 || action == 6){
                    if( this.prev_pointerId >= 0 ){
                        var index = 0;
                        for( var i = 0 ; i < pointers.length ; i++ ){
                            if( pointers[i].pointerId == this.prev_pointerId ){
                                index = i;
                                break;
                            }
                        }
                        this.context.lineTo(Math.floor(pointers[index].x * this.div), Math.floor(pointers[index].y * this.div));
                        this.context.stroke();
                        if( action == 6 && this.prev_pointerId == pointers[index].pointerId )
                            this.prev_pointerId = -1;
                    }
                }else if( action == 1 ){
                    if( this.prev_pointerId > 0 ){
                        if( this.prev_pointerId == pointers[0].pointerId ){
                            this.context.lineTo(Math.floor(pointers[0].x * this.div), Math.floor(pointers[0].y * this.div));
                            this.context.stroke();
                        }
                        this.prev_pointerId = -1;
                    }
                }
            }
        },
        initListener: async function(type, event){
            this.capability = event.cap;
            try{
                await pentablet.setPanel(0x02);
            }catch(error){
                console.log(error);
                alert(error);
            }finally{
                this.progress_close();
            }
        },
        changeListener: async function(type, event){
            if( event.panel == 2 && this.context == null ){
                this.original_width = event.size[0].width;
                this.original_height = event.size[0].height;
                this.canvas = $('#canvas')[0];
                if( this.original_width >= this.original_height ){
                    this.div = CANVAS_SIZE / this.original_width;
                    this.canvas.width = CANVAS_SIZE;
                    this.canvas.height = Math.floor(this.original_height * this.div);
                }else{
                    this.div = CANVAS_SIZE / this.original_height;
                    this.canvas.width = Math.floor(this.original_width * this.div);
                    this.canvas.height = CANVAS_SIZE;
                }
                this.context = canvas.getContext('2d');
            }
        },
        buttonListener: function(type, event){
            this.canvas_button(event.button);
        },
        canvas_button: function(btn){
            if( this.context != null ){
                if( btn == 0x20 ){
                    this.context.strokeStyle = 'rgb(0, 0, 0)';
                }else if( btn == 0x21 ){
                    this.context.strokeStyle = 'rgb(255, 0, 0)';
                }else if( btn == 0x22 ){
                    this.context.strokeStyle = 'rgb(0, 255, 0)';
                }else if( btn == 0x23 ){
                    this.context.strokeStyle = 'rgb(0, 0, 255)';
                }else if( btn == 0x24 ){
                    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
                }
            }
        },
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
