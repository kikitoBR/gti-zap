## new Message()

Extends

[Base](https://docs.wwebjs.dev/Base.html)

## Properties

### ack MessageAck

ACK status for the message

If the message was sent to a group, this field will contain the user that sent the message.

### body string

Message content

### broadcast boolean

Indicates if the message was a broadcast

### deviceType string

String that represents from which device type the message was sent

### duration string

Indicates the duration of the message in seconds

### forwardingScore number

Indicates how many times the message was forwarded.

The maximum value is 127.

### from string

ID for the Chat that this message was sent to, except if the message was sent by the current user.

### fromMe boolean

Indicates if the message was sent by the current user

### groupMentions Array of GroupMention

Indicates whether there are group mentions in the message body

### hasMedia boolean

Indicates if the message has media available for download

### hasQuotedMsg boolean

Indicates if the message was sent as a reply to another message.

### hasReaction boolean

Indicates whether there are reactions to the message

### id object

ID that represents the message

### inviteV4 object

Group Invite Data

### isEphemeral boolean

Indicates if the message will disappear after it expires

### isForwarded boolean

Indicates if the message was forwarded

### isGif boolean

Indicates whether the message is a Gif

### isStarred boolean

Indicates if the message was starred

### isStatus boolean

Indicates if the message is a status update

### links Array of {link: string, isSuspicious: boolean}

Links included in the message.

### location Location

Location information contained in the message, if the message is type "location"

### mediaKey string

MediaKey that represents the sticker 'ID'

### mentionedIds Array of string

Indicates the mentions in the message body.

### orderId string

Order ID for message type ORDER

### rawData Object

Returns message in a raw format

### timestamp number

Unix timestamp for when the message was created

### to string

ID for who this message is for.

If the message is sent by the current user, it will be the Chat to which the message is being sent. If the message is sent by another user, it will be the ID for the current user.

### token string

Order Token for message type ORDER

### type MessageTypes

Message type

### vCards Array of string

List of vCards contained in the message.

## Methods

### acceptGroupV4Invite() → Promise containing Object

Accept Group V4 Invite

Returns

`Promise containing Object`

### delete(everyone\[, clearMedia\])

Deletes a message from the chat

#### Parameters

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| everyone | boolean |  | If true and the message is sent by the current user or the user is an admin, will delete it for everyone in the chat.  Value can be null. |
| clearMedia | boolean | Yes | If true, any associated media will also be deleted from a device.  Value can be null. Defaults to `true`. |

### downloadMedia() → Promise containing MessageMedia

Downloads and returns the attatched message media

Returns

`Promise containing MessageMedia`

### edit(content\[, options\]) → Promise containing nullable Message

Edits the current message.

#### Parameters

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| content | string |  |  |
| options | MessageEditOptions | Yes | Options used when editing the message |

Returns

`Promise containing nullable Message`

### editScheduledEvent(editedEventObject) → Promise containing nullable Message

Edits the current ScheduledEvent message. Once the scheduled event is canceled, it can not be edited.

#### Parameter

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| editedEventObject | [ScheduledEvent](https://docs.wwebjs.dev/ScheduledEvent.html) |  |  |

Returns

`Promise containing nullable Message`

### forward(chat) → Promise

Forwards this message to another chat (that you chatted before, otherwise it will fail)

#### Parameter

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| chat | (string or [Chat](https://docs.wwebjs.dev/Chat.html)) |  | Chat model or chat ID to which the message will be forwarded |

Returns

`Promise`

### getChat() → Promise containing Chat

Returns the Chat this message was sent in

Returns

`Promise containing Chat`

### getContact() → Promise containing Contact

Returns the Contact this message was sent from

Returns

`Promise containing Contact`

### getGroupMentions() → Promise containing Array of GroupChat

Returns groups mentioned in this message

Returns

`Promise containing Array of GroupChat`

### getInfo() → Promise containing nullable MessageInfo

Get information about message delivery status. May return null if the message does not exist or is not sent by you.

Returns

`Promise containing nullable MessageInfo`

### getMentions() → Promise containing Array of Contact

Returns the Contacts mentioned in this message

Returns

`Promise containing Array of Contact`

### getOrder() → Promise containing Order

Gets the order associated with a given message

Returns

`Promise containing Order`

### getPayment() → Promise containing Payment

Gets the payment details associated with a given message

Returns

`Promise containing Payment`

### getPollVotes() → Promise containing Array of PollVote

Returns the PollVote this poll message

Returns

`Promise containing Array of PollVote`

### getQuotedMessage() → Promise containing Message

Returns the quoted message, if any

Returns

`Promise containing Message`

### getReactions() → Promise containing Array of ReactionList

Gets the reactions associated with the given message

Returns

`Promise containing Array of ReactionList`

### pin(duration) → Promise containing boolean

Pins the message (group admins can pin messages of all group members)

#### Parameter

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| duration | number |  | The duration in seconds the message will be pinned in a chat |

Returns

`Promise containing boolean`

Returns true if the operation completed successfully, false otherwise

### react(reaction) → Promise

React to this message with an emoji

#### Parameter

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| reaction | string |  | Emoji to react with. Send an empty string to remove the reaction. |

Returns

`Promise`

### reload() → Promise containing Message

Reloads this Message object's data in-place with the latest values from WhatsApp Web. Note that the Message must still be in the web app cache for this to work, otherwise will return null.

Returns

`Promise containing Message`

### reply(content\[, chatId\]\[, options\]) → Promise containing Message

Sends a message as a reply to this message. If chatId is specified, it will be sent through the specified Chat. If not, it will send the message in the same Chat as the original message was sent.

#### Parameters

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| content | (string, [MessageMedia](https://docs.wwebjs.dev/MessageMedia.html), or [Location](https://docs.wwebjs.dev/Location.html)) |  |  |
| chatId | string | Yes |  |
| options | [MessageSendOptions](https://docs.wwebjs.dev/global.html#MessageSendOptions) | Yes |  |

Returns

`Promise containing Message`

### star()

Stars this message

### unpin() → Promise containing boolean

Unpins the message (group admins can unpin messages of all group members)

Returns

`Promise containing boolean`

Returns true if the operation completed successfully, false otherwise

### unstar()

Unstars this message

### vote(selectedOptions) → Promise

Send votes to the poll message

#### Parameter

| Name | Type | Optional | Description |
| --- | --- | --- | --- |
| selectedOptions | Array of string |  | Array of options selected. |

Returns

`Promise`