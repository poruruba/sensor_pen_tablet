package com.example.sensorpentablet;

import android.view.MotionEvent;
import android.content.Context;
import android.util.AttributeSet;
import android.view.View;

public class TouchView extends View{
    private OnTouchEventListener listener = null;
    private int id;

    public class PointerXY{
        public int pointerid = -1;
        public float x = 0.0f;
        public float y = 0.0f;

        public PointerXY(){
        }
    }

    public class TouchViewEvent{
        public int id;
        public int action;
        public int targetId;
        public PointerXY[] pointers;

        public TouchViewEvent(int id, int count){
            this.id = id;
            this.pointers = new PointerXY[count];
            for( int i = 0 ; i < count; i++ )
                this.pointers[i] = new PointerXY();
        }
    }

    public interface OnTouchEventListener {
        void onTouchEvent(TouchViewEvent event);
    }

    public TouchView(Context context) {
        this(context, null);
    }

    public TouchView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    public void setOnTouchEventLister(int id, OnTouchEventListener listener){
        this.id = id;
        this.listener = listener;
    }

    public void removeOnTouchEventLister(){
        this.listener = null;
    }

    @Override
    public boolean onTouchEvent(MotionEvent event) {
        if( this.listener == null )
            return true;

        TouchViewEvent ev = new TouchViewEvent(id, event.getPointerCount());

        ev.action = event.getActionMasked();
        int pointerIndex = event.getActionIndex();
        ev.targetId = event.getPointerId(pointerIndex);
        for (int i = 0; i < ev.pointers.length; i++) {
            ev.pointers[i].pointerid = event.getPointerId(i);
            ev.pointers[i].x = event.getX(i);
            ev.pointers[i].y = event.getY(i);
        }

        if( this.listener != null )
            this.listener.onTouchEvent(ev);

        return true;
    }
}
