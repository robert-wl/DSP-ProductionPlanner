'use client';

import {useEffect, useMemo, useRef, useState} from 'react';

/**
 * The "add an item" dialog. The upstream page server-rendered one modal per
 * list; here both lists share this component and are built from whatever the
 * game-data API returned.
 */
export default function ItemPicker({title, items, excluded, onPick, onClose})
{
    let [search, setSearch] = useState('');
    let searchRef           = useRef(null);

    useEffect(function(){
        if(searchRef.current !== null)
        {
            searchRef.current.focus();
        }

        function onKeyDown(event)
        {
            if(event.key === 'Escape')
            {
                onClose();
            }
        }

        window.addEventListener('keydown', onKeyDown);

        return function(){ window.removeEventListener('keydown', onKeyDown); };
    }, [onClose]);

    let groups = useMemo(function(){
        let needle  = search.trim().toLowerCase();
        let byGroup = new Map();

        for(let itemId in items)
        {
            if(excluded.includes(itemId) === true)
            {
                continue;
            }

            let item = items[itemId];
            let name = item.name || itemId;

                if(needle !== '' && name.toLowerCase().includes(needle) === false && itemId.toLowerCase().includes(needle) === false)
                {
                    continue;
                }

            let category = item.category || 'other';

                if(byGroup.has(category) === false)
                {
                    byGroup.set(category, []);
                }

                byGroup.get(category).push({id: itemId, name: name, image: item.image});
        }

        return Array.from(byGroup.entries())
                    .sort(function(a, b){ return a[0].localeCompare(b[0]); })
                    .map(function(entry){
                        return {
                            category    : entry[0],
                            items       : entry[1].sort(function(a, b){ return a.name.localeCompare(b.name); })
                        };
                    });
    }, [items, excluded, search]);

    let total = groups.reduce(function(count, group){ return count + group.items.length; }, 0);

    return (
        <div className="pickerBackdrop" role="dialog" aria-modal="true" aria-label={title} onMouseDown={function(event){
            if(event.target === event.currentTarget)
            {
                onClose();
            }
        }}>
            <div className="picker">
                <header className="pickerHeader">
                    <h2>{title}</h2>
                    <button type="button" className="iconButton" onClick={onClose} aria-label="Close">&times;</button>
                </header>

                <input
                    ref={searchRef}
                    type="search"
                    className="pickerSearch"
                    placeholder="Search items&hellip;"
                    value={search}
                    onChange={function(event){ setSearch(event.target.value); }}
                />

                <div className="pickerBody">
                    {total === 0 && <p className="muted pickerEmpty">No item matches &ldquo;{search}&rdquo;.</p>}

                    {groups.map(function(group){
                        return (
                            <section key={group.category}>
                                <h3 className="pickerCategory">{group.category}</h3>
                                <ul className="pickerGrid">
                                    {group.items.map(function(item){
                                        return (
                                            <li key={item.id}>
                                                <button type="button" className="pickerItem" onClick={function(){ onPick(item.id); }}>
                                                    {item.image && <img src={item.image} alt="" />}
                                                    <span>{item.name}</span>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
