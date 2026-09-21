#!/usr/bin/env python3
"""Render Meadow's original, silent product walkthrough (Pillow + FFmpeg).

Run: python3 scripts/render-hero-demo.py
Illustrative demo data only. No accounts are connected and no posts are sent.
"""
from pathlib import Path
import os
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend/public/marketing'
W, H, FPS, SECONDS = 1280, 800, 24, 22
INK, MUTED, BLUE, GREEN = '#233247', '#748173', '#3266df', '#42734a'
FONT_DIR = Path(os.environ.get('MEADOW_FONT_DIR', '/System/Library/Fonts/Supplemental'))
FONTS = {}
ICONS = {name: Image.open(ROOT / f'scripts/hero-demo-assets/{name}.png').convert('RGBA') for name in ['LinkedIn', 'Threads', 'Bluesky']}

def font(size, bold=False):
    key = (size, bold)
    if key not in FONTS:
        path = FONT_DIR / ('Arial Bold.ttf' if bold else 'Arial.ttf')
        if not path.exists():
            path = Path('/usr/share/fonts/truetype/dejavu') / ('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf')
        FONTS[key] = ImageFont.truetype(str(path), size)
    return FONTS[key]

def ease(v):
    v = max(0, min(1, v))
    return v * v * (3 - 2 * v)

def rect(d, box, fill, radius=18, outline=None, width=1):
    d.rounded_rectangle(tuple(map(round, box)), radius, fill, outline, width)

def text(d, xy, value, size=24, fill=INK, bold=False):
    d.text(xy, value, font=font(size, bold), fill=fill, stroke_width=0)

def check(d, x, y, color='white', size=14):
    d.line([(x-size*.5,y),(x-size*.1,y+size*.4),(x+size*.65,y-size*.5)], fill=color, width=3, joint='curve')

def platform(d, x, y, name, size=40):
    color = {'LinkedIn':'#0a66c2', 'Threads':'#17201a', 'Bluesky':'#1687f5'}[name]
    rect(d,(x,y,x+size,y+size),color,10)
    icon = ICONS[name].resize((size-14,size-14),Image.Resampling.LANCZOS)
    d.bitmap((x+7,y+7),icon,fill='white')

def artwork(d, x, y, w, h):
    rect(d,(x,y,x+w,y+h),'#e6eddb',16)
    d.ellipse((x+w*.54,y+h*.10,x+w*.90,y+h*.65), fill='#bdceab')
    d.ellipse((x+w*.64,y+h*.23,x+w*.80,y+h*.52), fill='#e6eddb')
    text(d,(x+22,y+22),'STUDIO / 01',16,GREEN,True)
    text(d,(x+22,y+h-95),'Make room.',31,INK,True)
    text(d,(x+22,y+h-53),'For your next big idea.',18,INK)

def cursor(d, x, y, click=False):
    if click:
        d.ellipse((x-22,y-22,x+22,y+22), outline='#a9bff5', width=4)
    pts=[(x,y),(x+4,y+31),(x+12,y+24),(x+20,y+37),(x+27,y+33),(x+19,y+20),(x+31,y+17)]
    d.polygon(pts, fill='#25374b', outline='white', width=2)

def frame(t):
    im=Image.new('RGB',(W,H),'#f6f8f2'); d=ImageDraw.Draw(im)
    # Quiet product chrome, large enough to read in the hero.
    d.rectangle((0,0,W,75), fill='#fffefb')
    d.line((0,75,W,75),fill='#dce3d5',width=2)
    text(d,(30,18),'meadow.',31,INK,True)
    rect(d,(1023,22,1248,54),'#eef3e7',16)
    d.ellipse((1041,33,1051,43),fill='#79a35d')
    text(d,(1062,28),'Studio workspace',18,GREEN)
    d.rectangle((0,77,201,725),fill='#f0f4e9')
    active = 'Posts' if t >=18 else 'Create post'
    for y,label in [(115,'Create post'),(180,'Posts'),(245,'Connections')]:
        if label==active: rect(d,(16,y-6,185,y+41),'#e0e9d5',12)
        text(d,(32,y+4),label,21,INK if label==active else MUTED,label==active)
    text(d,(32,632),'YOUR WORKSPACE',12,MUTED,True)
    text(d,(32,658),'Studio',22,INK,True)
    step = 0 if t<5 else 1 if t<12 else 2 if t<18 else 3
    labels=['Choose your channels','Make it yours','Pick the perfect time','Ready for what’s next']
    text(d,(240,104),labels[step],38,INK,True)
    text(d,(241,157),['One post. Three connected accounts.','Write once. Preview before you publish.','Schedule every destination together.','Your post is scheduled across three channels.'][step],23,MUTED)
    if t < 18:
        # Select the destinations in sequence, then retain them throughout.
        for i,name in enumerate(['LinkedIn','Threads','Bluesky']):
            x=240+i*327; selected=t>1.2+i*.85
            rect(d,(x,212,x+309,288),'#ffffff' if not selected else '#edf2ff',16,'#c7d4f1' if selected else '#dce3d5',2)
            platform(d,x+16,230,name,40); text(d,(x+69,236),name,23,INK,True)
            d.ellipse((x+266,237,x+290,261),fill=BLUE if selected else '#ffffff',outline=BLUE if selected else '#c4cdbd',width=2)
            if selected: check(d,x+278,249,size=11)
        if t<12:
            rect(d,(240,313,869,686),'white',20,'#dce3d5')
            text(d,(264,333),'Your post',20,INK,True)
            lines=['A little space for your next big idea.','Our new studio opens Friday.','Come make something with us.']
            full='\n'.join(lines); typed=full[:int(max(0,min(1,(t-5)/3.7))*len(full))]
            if t<5: text(d,(264,388),'What would you like to share?',26,'#95a08f')
            else:
                for i,line in enumerate(typed.split('\n')): text(d,(264,387+i*42),line,26,INK)
                if t<9.2 and int(t*3)%2==0:
                    line=typed.split('\n')[-1]; xx=264+d.textlength(line,font=font(26)); yy=391+(len(typed.split('\n'))-1)*42
                    d.line((xx+3,yy,xx+3,yy+28),fill=BLUE,width=2)
            rect(d,(264,555,845,661),'#f6f8f2',12)
            rect(d,(278,568,372,648),'#dce8cf',10)
            d.ellipse((329,578,360,612),fill='#9fb98a')
            text(d,(391,577),'studio-launch.png',21,INK,True)
            text(d,(391,612),'Image attached',18,MUTED)
            rect(d,(894,313,1221,686),'white',20,'#dce3d5')
            text(d,(917,334),'Post preview',20,INK,True)
            artwork(d,917,378,281,220)
            text(d,(917,623),'Studio',20,INK,True)
            text(d,(917,652),'Ready for your channels',17,MUTED)
            if t < 4.8:
                points=[(510,253),(837,253),(1164,253)]
                idx=min(2,max(0,int((t-.8)/.85)))
                prev=(660,380) if idx==0 else points[idx-1]
                dest=points[idx]; p=ease((t-(.8+idx*.85))/.35)
                cursor(d,prev[0]+(dest[0]-prev[0])*p,prev[1]+(dest[1]-prev[1])*p,abs(t-(1.2+idx*.85))<.16)
        else:
            rect(d,(240,313,1221,686),'white',20,'#dce3d5')
            text(d,(273,341),'Publish',25,INK,True)
            rect(d,(273,395,590,451),'#f5f7f1',13,'#dce3d5')
            text(d,(298,410),'Now',22,MUTED)
            rect(d,(433,399,586,447),'#e8efff',10)
            text(d,(456,410),'Schedule',22,BLUE,True)
            text(d,(273,485),'DATE',14,MUTED,True); text(d,(655,485),'TIME',14,MUTED,True)
            rect(d,(273,518,623,578),'#fffefb',12,'#ccd7c0')
            rect(d,(655,518,990,578),'#fffefb',12,'#ccd7c0')
            text(d,(296,536),'Friday, October 2',24,INK)
            text(d,(678,536),'10:30 AM',24,INK)
            text(d,(274,625),'3 destinations · Preview checked',21,GREEN)
            rect(d,(875,608,1188,662),BLUE if t<17.2 else '#2854b9',12)
            text(d,(925,623),'Schedule post',22,'white',True)
            if t>14.8:
                p=ease((t-14.8)/1.9); cursor(d,766+(1076-766)*p,460+(638-460)*p,17.1<t<17.4)
    else:
        rect(d,(240,212,1221,293),'#e7f0df',16)
        d.ellipse((265,231,308,274),fill=GREEN); check(d,285,252,size=18)
        text(d,(328,229),'All set. Your post is scheduled.',27,GREEN,True)
        text(d,(329,264),'Friday, October 2 · 10:30 AM',18,GREEN)
        for i,name in enumerate(['LinkedIn','Threads','Bluesky']):
            y=317+i*117
            rect(d,(240,y,1221,y+99),'white',16,'#dce3d5')
            platform(d,266,y+27,name,44)
            text(d,(331,y+21),'Studio launch',25,INK,True)
            text(d,(332,y+58),name,20,MUTED)
            text(d,(743,y+35),'Oct 2 · 10:30 AM',22,INK)
            rect(d,(1021,y+29,1195,y+70),'#e8f0df',20)
            text(d,(1043,y+38),'Scheduled',20,GREEN,True)
    # Chapters and progress are baked into the video; no sound is required.
    d.rectangle((0,727,W,H),fill='#fffefb')
    d.line((0,727,W,727),fill='#dce3d5',width=2)
    for i,label in enumerate(['Select','Create','Schedule','Done']):
        x=43+i*305
        d.ellipse((x,752,x+27,779),fill=BLUE if i==step else '#edf1e6')
        text(d,(x+9,756),str(i+1),15,'white' if i==step else MUTED,True)
        text(d,(x+40,754),label,21,INK if i==step else MUTED,i==step)
    d.rectangle((0,796,int(W*t/SECONDS),799),fill=BLUE)
    # Gentle dip through the opening frame makes the loop intentional.
    if t>21.5:
        im=Image.blend(im,frame(0),ease((t-21.5)/.5))
    return im

if __name__=='__main__':
    OUT.mkdir(parents=True,exist_ok=True)
    frame(10.5).save(OUT/'meadow-publishing-demo-v1.webp',quality=86)
    command=['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-','-an','-c:v','libx264','-preset','slow','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/'meadow-publishing-demo-v1.mp4')]
    proc=subprocess.Popen(command,stdin=subprocess.PIPE)
    for n in range(FPS*SECONDS): proc.stdin.write(frame(n/FPS).tobytes())
    proc.stdin.close()
    if proc.wait(): raise SystemExit('FFmpeg failed')
    subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(OUT/'meadow-publishing-demo-v1.mp4'),'-an','-c:v','libvpx-vp9','-b:v','0','-crf','34','-row-mt','1',str(OUT/'meadow-publishing-demo-v1.webm')],check=True)
    print('Rendered 22-second Meadow demo and poster to',OUT)
