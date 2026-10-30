#!/usr/bin/env python3
"""Publish this six-sticker pack using a locally configured Telegram bot."""
import argparse,json,os,re,sys
from bot import Api,ApiError,WEB,load_items,check,read_state,save_state

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--publish',action='store_true');parser.add_argument('--owner-id',type=int);parser.add_argument('--name',default='SkazhiZhestomCat');parser.add_argument('--write-config',action='store_true');args=parser.parse_args()
    items=load_items();check(items)
    if not args.publish:
        print('Preview only: creates one video sticker pack owned by --owner-id. Use --publish to execute.');return 0
    if not args.owner_id or args.owner_id<=0:raise ValueError('Provide your positive Telegram user_id using --owner-id. Open the bot and send /whoami first.')
    if not re.fullmatch('[A-Za-z][A-Za-z0-9_]*',args.name) or '__' in args.name:raise ValueError('Invalid pack name prefix')
    api=Api(os.environ.get('TELEGRAM_BOT_TOKEN',''));me=api.call('getMe');name=args.name+'_by_'+me['username']
    if len(name)>64:raise ValueError('Pack name including bot suffix must be at most 64 characters')
    uploaded=[]
    for item in items:
        result=api.call('uploadStickerFile',{'user_id':args.owner_id,'sticker_format':'video'},{'sticker':WEB/item['webm']})
        uploaded.append({'sticker':result['file_id'],'format':'video','emoji_list':[item['emoji']]})
    api.call('createNewStickerSet',{'user_id':args.owner_id,'name':name,'title':'Скажи жестом · Котик рядом','stickers':uploaded,'sticker_type':'regular'})
    created=api.call('getStickerSet',{'name':name});stickers=created.get('stickers',[])
    if len(stickers)!=len(items):raise ValueError('Unexpected sticker count; inspect pack in Telegram before retrying')
    state=read_state();state.setdefault('file_ids',{});state.setdefault('unique_ids',{})
    for item,sticker in zip(items,stickers):state['file_ids'][item['id']]=sticker['file_id'];state['unique_ids'][sticker['file_unique_id']]=item['id']
    save_state(state);url='https://t.me/addstickers/'+name
    if args.write_config:
        config=WEB/'config.json';data=json.loads(config.read_text(encoding='utf-8'));data.update(telegramPackUrl=url,botUsername=me['username']);config.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('config.json updated. Publish that file to activate the Add pack button on the website.')
    print(url);return 0
if __name__=='__main__':
    try:sys.exit(main())
    except (ValueError,ApiError,OSError) as exc:print(str(exc),file=sys.stderr);sys.exit(1)
