## new Chat()

Extends

[Base](https://docs.wwebjs.dev/Base.html)

## Properties

### archived boolean

Indicates if the Chat is archived

### id object

ID that represents the chat

### isGroup boolean

Indicates if the Chat is a Group Chat

### isLocked boolean

Indicates if the Chat is locked

### isMuted boolean

Indicates if the chat is muted or not

### isReadOnly boolean

Indicates if the Chat is readonly

### lastMessage Message

Last message fo chat

### muteExpiration number

Unix timestamp for when the mute expires

### name string

Title of the chat

### boolean

Indicates if the Chat is pinned

### timestamp number

Unix timestamp for when the last activity occurred

### unreadCount number

Amount of messages unread

## Methods

### addOrEditCustomerNote(note) → Promise containing void

Add or edit a customer note

#### Parameter

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| note | string |  | The note to add |

See also

[https://faq.whatsapp.com/1433099287594476](https://faq.whatsapp.com/1433099287594476)

Returns

`Promise containing void`

### archive()

Archives this chat

### changeLabels(labelIds) → Promise containing void

Add or remove labels to this Chat

#### Parameter

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| labelIds | Array of (number or string) |  |  |

Returns

`Promise containing void`

### clearMessages() → Promise containing boolean

Clears all messages from the chat

Returns

`Promise containing boolean`

result

### clearState()

Stops typing or recording in chat immediately.

### delete() → Promise containing Boolean

Deletes the chat

Returns

`Promise containing Boolean`

result

### fetchMessages(searchOptions) → Promise containing Array of Message

Loads chat messages, sorted from earliest to latest.

#### Parameters

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| searchOptions | Object |  | Options for searching messages. Right now only limit and fromMe is supported.  Values in `searchOptions` have the following properties:  \| Name \| Type \| Optional \| Description \| \| --- \| --- \| --- \| --- \| \| limit \| Number \| Yes \| The amount of messages to return. If no limit is specified, the available messages will be returned. Note that the actual number of returned messages may be smaller if there aren't enough messages in the conversation. Set this to Infinity to load all messages. \| \| fromMe \| Boolean \| Yes \| Return only messages from the bot number or vise versa. To get all messages, leave the option undefined. \| | Name | Type | Optional | Description | limit | Number | Yes | The amount of messages to return. If no limit is specified, the available messages will be returned. Note that the actual number of returned messages may be smaller if there aren't enough messages in the conversation. Set this to Infinity to load all messages. | fromMe | Boolean | Yes | Return only messages from the bot number or vise versa. To get all messages, leave the option undefined. |
| Name | Type | Optional | Description |
| limit | Number | Yes | The amount of messages to return. If no limit is specified, the available messages will be returned. Note that the actual number of returned messages may be smaller if there aren't enough messages in the conversation. Set this to Infinity to load all messages. |
| fromMe | Boolean | Yes | Return only messages from the bot number or vise versa. To get all messages, leave the option undefined. |

Returns

`Promise containing Array of Message`

### getContact() → Promise containing Contact

Returns the Contact that corresponds to this Chat.

Returns

`Promise containing Contact`

### getCustomerNote() → Promise containing {chatId: string, content: string, createdAt: number, id: string, modifiedAt: number, type: string}

Get a customer note

See also

[https://faq.whatsapp.com/1433099287594476](https://faq.whatsapp.com/1433099287594476)

Returns

`Promise containing {chatId: string, content: string, createdAt: number, id: string, modifiedAt: number, type: string}`

### getLabels() → Promise containing Array of Label

Returns array of all Labels assigned to this Chat

Returns

`Promise containing Array of Label`

### getPinnedMessages() → Promise containing Array of Message

Gets instances of all pinned messages in a chat

Returns

`Promise containing Array of Message`

### markUnread()

Mark this chat as unread

### mute(unmuteDate) → Promise containing {isMuted: boolean, muteExpiration: number}

Mutes this chat forever, unless a date is specified

#### Parameter

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| unmuteDate | Date |  | Date when the chat will be unmuted, don't provide a value to mute forever  Value can be null. |

Returns

`Promise containing {isMuted: boolean, muteExpiration: number}`

### pin() → Promise containing boolean

Pins this chat

Returns

`Promise containing boolean`

New pin state. Could be false if the max number of pinned chats was reached.

### sendMessage(content\[, options\]) → Promise containing Message

Send a message to this chat

#### Parameters

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| content | (string, [MessageMedia](https://docs.wwebjs.dev/MessageMedia.html), or [Location](https://docs.wwebjs.dev/Location.html)) |  |  |
| options | [MessageSendOptions](https://docs.wwebjs.dev/global.html#MessageSendOptions) | Yes |  |

Returns

`Promise containing Message`

Message that was just sent

### sendSeen() → Promise containing Boolean

Sets the chat as seen

Returns

`Promise containing Boolean`

result

### sendStateRecording()

Simulate recording audio in chat. This will last for 25 seconds.

### sendStateTyping()

Simulate typing in chat. This will last for 25 seconds.

### syncHistory() → Promise containing boolean

Sync chat history conversation

Returns

`Promise containing boolean`

True if operation completed successfully, false otherwise.

### unarchive()

un-archives this chat

### unmute() → Promise containing {isMuted: boolean, muteExpiration: number}

Unmutes this chat

Returns

`Promise containing {isMuted: boolean, muteExpiration: number}`

### unpin() → Promise containing boolean

Unpins this chat

Returns

`Promise containing boolean`

New pin state