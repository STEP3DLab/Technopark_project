#!/usr/bin/env python3
"""Скажи жестом: local Telegram bot; Python standard library only."""
from __future__ import annotations
import argparse, json, os, re, sys, time, uuid
from pathlib import Path
from urllib import request, error

PROJECT=Path(__file__).resolve().parent.parent
WEB=PROJECT/'dist' if (PROJECT/'dist/catalog.json').exists() else PROJECT
CATALOG=WEB/'catalog.json'
STATE_FILE=Path(os.environ.get('BOT_STATE_FILE',str(Path(__file__).parent/'.state.json')))

def normalize(text):
    return re.sub(r'[^\w\s]',' ',str(text).lower().replace('ё','е')).strip()

def load_items():
    return json.loads(CATALOG.read_text(encoding='utf-8'))['items']

def multipart(fields,files,boundary=None):
    boundary=boundary or 'cat-'+uuid.uuid4().hex
    data=bytearray()
    for name,value in fields.items():
        encoded=json.dumps(value,ensure_ascii=False) if isinstance(value,(dict,list,bool)) else str(value)
        data.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{encoded}\r\n'.encode())
    for name,path in files.items():
        path=Path(path)
        data.extend(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{path.name}"\r\nContent-Type: video/webm\r\n\r\n'.encode())
        data.extend(path.read_bytes()); data.extend(b'\r\n')
    data.extend(f'--{boundary}--\r\n'.encode())
    return bytes(data),'multipart/form-data; boundary='+boundary

class ApiError(RuntimeError):
    def __init__(self,message,code=0,retry=3):
        super().__init__(message);self.code=code;self.retry=retry

class Api:
    def __init__(self,token):
        if not re.fullmatch(r'\d+:[A-Za-z0-9_-]{20,}',token or ''):
            raise ValueError('Set TELEGRAM_BOT_TOKEN locally. Do not put it into source files.')
        self._url='https://api.telegram.org/bot'+token+'/'
    def call(self,method,fields=None,files=None):
        fields=fields or {}
        if files: body,content_type=multipart(fields,files)
        else: body=json.dumps(fields,ensure_ascii=False).encode();content_type='application/json'
        req=request.Request(self._url+method,data=body,headers={'Content-Type':content_type},method='POST')
        try:
            with request.urlopen(req,timeout=40) as response: payload=json.load(response)
        except error.HTTPError as exc:
            try: payload=json.loads(exc.read())
            except (ValueError,UnicodeError): raise ApiError('Telegram HTTP request failed',exc.code) from None
        except (error.URLError,TimeoutError,OSError): raise ApiError('Network request failed; retry later') from None
        if not payload.get('ok'):
            raise ApiError(str(payload.get('description','Telegram request failed')),payload.get('error_code',0),payload.get('parameters',{}).get('retry_after',3))
        return payload['result']

def read_state():
    try: return json.loads(STATE_FILE.read_text(encoding='utf-8'))
    except (OSError,ValueError): return {'offset':0,'file_ids':{},'unique_ids':{}}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True,exist_ok=True)
    temp=STATE_FILE.with_suffix('.tmp');temp.write_text(json.dumps(state,ensure_ascii=False),encoding='utf-8');temp.chmod(0o600);temp.replace(STATE_FILE)

class Bot:
    def __init__(self,api,items,state=None,persist=None):
        self.api=api;self.items=items;self.by_id={i['id']:i for i in items};self.state=state if state is not None else {'file_ids':{},'unique_ids':{}};self.persist=persist or (lambda s:None)
        self.state.setdefault('file_ids',{});self.state.setdefault('unique_ids',{})
    def menu(self,chat):
        buttons=[{'text':i['emoji']+' '+i['label'],'callback_data':'cat:'+i['id']} for i in self.items]
        return self.api.call('sendMessage',{'chat_id':chat,'text':'Выбери котика — пришлю стикер и его значение. Можно написать «привет», «спасибо», «обнять», «молодец», «не понял» или «пока».','reply_markup':{'inline_keyboard':[buttons[i:i+2] for i in range(0,len(buttons),2)]}})
    def send(self,chat,item):
        file_id=self.state['file_ids'].get(item['id'])
        fields={'chat_id':chat,'emoji':item['emoji']}
        if file_id: fields['sticker']=file_id;result=self.api.call('sendSticker',fields)
        else: result=self.api.call('sendSticker',fields,{'sticker':WEB/item['webm']})
        sticker=result.get('sticker',{})
        if sticker.get('file_id'):self.state['file_ids'][item['id']]=sticker['file_id']
        if sticker.get('file_unique_id'):self.state['unique_ids'][sticker['file_unique_id']]=item['id']
        self.persist(self.state)
        self.api.call('sendMessage',{'chat_id':chat,'text':item['label']})
    def handle(self,update):
        cb=update.get('callback_query')
        if cb:
            message=cb.get('message',{});chat=message.get('chat',{})
            if chat.get('type')!='private' or cb.get('from',{}).get('id')!=chat.get('id'):return
            self.api.call('answerCallbackQuery',{'callback_query_id':cb['id']})
            item=self.by_id.get(str(cb.get('data','')).removeprefix('cat:')) if str(cb.get('data','')).startswith('cat:') else None
            if item:self.send(chat['id'],item)
            return
        message=update.get('message',{});chat=message.get('chat',{})
        if chat.get('type')!='private':return
        chat_id=chat['id'];text=str(message.get('text','')).strip()
        if text.split(' ',1)[0] in ['/start','/help']:
            self.menu(chat_id);return
        if text=='/whoami':
            self.api.call('sendMessage',{'chat_id':chat_id,'text':f'Твой Telegram user_id: {chat_id}'});return
        if 'sticker' in message:
            item=self.by_id.get(self.state['unique_ids'].get(message['sticker'].get('file_unique_id')))
            reply=item['label'] if item else 'Этот стикер мне пока неизвестен. Я узнаю только котиков из нашего набора, которые уже отправлял. /start — выбрать котика.'
            self.api.call('sendMessage',{'chat_id':chat_id,'text':reply});return
        query=normalize(text)
        item=next((i for i in self.items if query and query in [normalize(i['label']),*[normalize(t) for t in i['tags']]]),None)
        if item:self.send(chat_id,item)
        else:self.menu(chat_id)

def check(items):
    assert len(items)==6 and len({i['id'] for i in items})==6
    for item in items:
        file=WEB/item['webm']
        if not file.is_file() or not 0<file.stat().st_size<256*1024:raise ValueError('Invalid sticker file: '+item['id'])
    print('OK: 6 local stickers and catalog. No network calls or token required.')

def run():
    items=load_items();check(items);api=Api(os.environ.get('TELEGRAM_BOT_TOKEN',''));api.call('getMe')
    if api.call('getWebhookInfo').get('url'):raise ValueError('This bot has an active webhook. Use a separate bot or disable that webhook yourself.')
    state=read_state();bot=Bot(api,items,state,save_state)
    print('Bot running. Press Ctrl+C to stop. Messages are not logged.')
    while True:
        try:
            updates=api.call('getUpdates',{'offset':state.get('offset',0),'timeout':25,'allowed_updates':['message','callback_query']})
            for update in updates:
                try:bot.handle(update)
                except ApiError as exc:
                    if exc.code==429:raise
                    print('An update could not be answered; continuing.',file=sys.stderr)
                state['offset']=update['update_id']+1;save_state(state)
        except ApiError as exc:
            if exc.code in [401,409]:raise
            print('Telegram is temporarily unavailable; retrying.',file=sys.stderr);time.sleep(max(3,min(exc.retry,60)))

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');parser.add_argument('--run',action='store_true');args=parser.parse_args()
    try:
        if args.run:run()
        else:check(load_items())
    except KeyboardInterrupt:print('Stopped.')
    except (ValueError,ApiError,OSError) as exc:print(str(exc),file=sys.stderr);return 1
    return 0
if __name__=='__main__':sys.exit(main())
