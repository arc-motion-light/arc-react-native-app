/**
 ******************************************************************************
 * @file    ConfigurationModel.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    07-Mar-2018
 * @brief   Implementation of Configuration Model.
 ******************************************************************************
 * @attention
 *
 * <h2><center>&copy; COPYRIGHT(c) 2019 STMicroelectronics</center></h2>
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *   1. Redistributions of source code must retain the above copyright notice,
 *      this list of conditions and the following disclaimer.
 *   2. Redistributions in binary form must reproduce the above copyright notice,
 *      this list of conditions and the following disclaimer in the documentation
 *      and/or other materials provided with the distribution.
 *   3. Neither the name of STMicroelectronics nor the names of its contributors
 *      may be used to endorse or promote products derived from this software
 *      without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 ******************************************************************************
 */

#import <Foundation/Foundation.h>
#import "STMeshBasicTypes.h"
#import "STMeshCompositionDataModel.h"

typedef enum ConfigState_t : uint8_t {
    ConfigState_disabled,
    ConfigState_enabled,
    ConfigState_notSupported,
    
    /* This Value is not part of config model but provided by the SDK to ease App development. */
    ConfigState_Timeout  = 0xFF
}ConfigState;

typedef enum ConfigModelStatus_t : uint8_t {
    ConfigModelStatus_Success,
    ConfigModelStatus_InvalidAddress,
    ConfigModelStatus_InvalidModel,
    ConfigModelStatus_InvalidAppKeyIndex,
    ConfigModelStatus_InvalidNetKeyIndex,
    ConfigModelStatus_InsufficientResources,
    ConfigModelStatus_KeyIndexAlreadyStored,
    ConfigModelStatus_InvalidPublishParameters,
    ConfigModelStatus_NotASubscribeModel,
    ConfigModelStatus_StorageFailure,
    ConfigModelStatus_FeatureNotSupported,
    ConfigModelStatus_CannotUpdate,
    ConfigModelStatus_CannotRemove,
    ConfigModelStatus_CannotBind,
    ConfigModelStatus_TemporarilyUnableToChangeState,
    ConfigModelStatus_CannotSet,
    ConfigModelStatus_UnspecifiedError,
    ConfigModelStatus_InvalidBinding,
    
    /* This Value is not part of config model but provided by the SDK to ease App development. */
    ConfigModelStatus_Timeout = 0xFF
}ConfigModelStatus;

@protocol STMeshConfigModelDelegate;

@interface STMeshConfigurationModel : NSObject

@property (nonatomic, weak) id<STMeshConfigModelDelegate> delegate;

/**
 * @brief resetConfigNode method. peerAddress one parameter required
 * @discussion This function is used to Sent Config reset / unprovision to a peer node.
 *  Warning: This command would remove configuration data from the node. causing it to be removed from the network.
 * @param1 peerAddress Peer Address of Node
 * @code
    manager.getConfigurationModel().resetConfigNode(node.unicastAddress)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)resetConfigNode:(uint16_t)peerAddress;

/**
 * @brief getConfigCompositionData method. peerAddress, pageNumber two parameter required
 * @discussion This function is used to used to request composion data  Status to a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 pageNumber page Number
 * @code
    manager.getConfigurationModel().getConfigCompositionData(node.unicastAddress,pageNumber:1 )
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, pageNumber is Uint_8t datatype
 */
-(STMeshStatus)getConfigCompositionData:(uint16_t)peerAddress pageNumber:(uint8_t)pageNumber;

/**
 * @brief getConfigNodeRelay method. peerAddress one parameter required
 * @discussion This function is used to request the relay status data to a peer node.
 * @param1 peerAddress Peer Address of Node
 * @code
    manager.getConfigurationModel().getConfigNodeRelay(node.unicastAddress)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)getConfigNodeRelay:(uint16_t)peerAddress;


/**
 * @brief setConfigNodeRelay method. peerAddress, enableRelay, count, interval, Four  parameter required
 * @discussion This method enables or disables the relay feature of a node..
 * @param1 peerAddress Peer Address of Node
 * @param2 enableRelay  relay value
 * @param3 count  Retransmit Count value
 * @param4 interval ie Retransmit Interval
 * @code
    manager.getConfigurationModel().setConfigNodeRelay(element.unicastAddress,relay:tue, retransmitCount:12 ,retransmitInterval:51)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype,enableRelay is Bool datatype, count is uint_8t datatype, interval is uint16_t datatype
 */
-(STMeshStatus)setConfigNodeRelay:(uint16_t)peerAddress relay:(BOOL)enableRelay retransmitCount:(uint8_t)count retransmitInterval:(uint16_t)interval;

/**
 * @brief getConfigNodeGATTProxy method. peerAddress one parameter required
 * @discussion This function is used to request GATT Proxy status data to a peer node.
 * @param1 peeraddress Peer Address of Node
 * @code
    manager.getConfigurationModel().getConfigNodeGATTProxy(node.unicastAddress)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)getConfigNodeGATTProxy:(uint16_t)peeraddress;


/**
 * @brief setConfigNodeGATTProxy method. peerAddress , isEnableProxy two parameter required
 * @discussion This method enables or disables the proxy feature of a node.
 * @param1 peerAddress Peer Address of Node
 * @code
    manager.getConfigurationModel().setConfigNodeGATTProxy(node.unicastAddress, proxyState:true)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, isEnableProxy is datatype is Bool
 */
-(STMeshStatus)setConfigNodeGATTProxy:(uint16_t)peerAddress proxyState:(BOOL)isEnableProxy;


/**
 * @brief getConfigNodeFriend method. peerAddress one parameter required
 * @discussion This method is used to request friend status data.
 * @param1 peeraddress Peer Address of Node
 * @code
    manager.getConfigurationModel().getConfigNodeFriend(node.unicastAddress)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype.
 */
-(STMeshStatus)getConfigNodeFriend:(uint16_t)peeraddress;


/**
 * @brief setConfigNodeFriend method. peerAddress , isEnableFriend two parameter required
 * @discussion This method enables or disables the friend feature of a node.
 * @param1 peerAddress Peer Address of Node
 * @code
    manager.getConfigurationModel().setConfigNodeFriend(node.unicastAddress, isEnableFriend:true)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, isEnableFriend is datatype is Bool
 */
-(STMeshStatus)setConfigNodeFriend:(uint16_t)peerAddress friendState:(BOOL)isEnableFriend;


/**
 * @brief addConfigModelSubscriptionToNode method. peerAddress , isEnableFriend two parameter required
 * @discussion This function is used to sends request for adding subscription to an element of a node.
 * @param1 peerAddress Peer Address of Node
 * @param2 elementAdrress Element Address of element
 * @param3 subscriptionAddress Subscribe Address of Group
 * @param4 modelIdentifier Model Id of Selected Model
 * @param5 isVendorModelId   Vandor Model Flage
 * @code
    manager.getConfigurationModel().addConfigModelSubscriptionToNode(node.unicastAddress, elementAddress:element.unicastAddress,address:group.addess, modelIdentifier:model.ModelId,isVendorModelId:true)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, elementAddress is datatype is uint16_t, subscriptionAddress is uint16_t datatype, modelIdentifier is uint32_t datatype, isVendorModelId is Bool datatype
 */
- (STMeshStatus) addConfigModelSubscriptionToNode:(uint16_t )peerAddress elementAddress:(uint16_t)elementAdrress address:(uint16_t)subscriptionAddress modelIdentifier:(uint32_t)modelIdentifier isVendorModelId:(BOOL)isVendorModelId;


/**
 * @brief getConfigPublish method. peerAddress, elementAddress, modelIdentifier,isVendorModelId Four parameter required
 * @discussion This function is used to request Config Publish Status data
 * @param1 peerAddress Peer Address of Node
 * @param2 elementAddress Element Address of element
 * @param3 modelIdentifier Model Id of Slected Model
 * @param4 isVendorModelId   Vandor Model Flage
 * @code
    manager.getConfigurationModel().getConfigPublish(node.unicastAddress, elementAddress:element.unicastAddress, modelIdentifier:model.ModelId,isVendorModelId:true)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, elementAddress is datatype is uint16_t, modelIdentifier is uint32_t datatype, isVendorModelId is Bool datatype
 */
- (STMeshStatus)getConfigPublish:(uint16_t)peerAddress elementAddress:(uint16_t)elementAddress modelIdentifier:(uint32_t)modelIdentifier isVendorModelId:(BOOL)isVendorModelId;

/**
 * @brief setConfigModelPublicationOnNode method.peerAddress, elementAddress,publishAddress, appKeyIndex, credentialFlag, publishTTL, publishPeriod, count, interval,  modelIdentifier,isVendorModelId Eleven parameter required
 * @discussion This function is used to sends request for adding publish target (element / group) to an element of a node.
 * @param1 peerAddress Peer Address of Node
 * @param2 elementAddress Element Address of element
 * @param3 publishAddress publisher Address
 * @param4 appKeyIndex index of App Key
 * @param5 credentialFlag Master Key Credential Flag
 * @param6 publishTTL publish TTL Value
 * @param7 publishPeriod Publish Period
 * @param8 count Retransmit Count
 * @param9 interval Retransmit Interval
 * @param10 modelIdentifier   model id of Selected model
 * @param11 isVendorModelId   Vandor Model Flage
 * @code
    manager.getConfigurationModel().setConfigModelPublicationOnNode(node.unicastAddress, elementAddress:element.unicastAddress,publishAddress:group.addess,appKeyIndex:1, credentialFlag:true,publishTTL:123, publishPeriod:12,retransmitCount:123, retransmitInterval:12, modelIdentifier:model.ModelId,isVendorModelId:true)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, elementAddress is datatype is uint16_t, publishAddress is uint16_t datatype, appKeyIndex is uint16_t datatype,credentialFlag is Bool dataType, publishTTL is Uint_8t dataType, count is Uint_8t dataType, interval is Uint_8t dataType,   modelIdentifier is uint32_t datatype, isVendorModelId is Bool datatype
 */

- (STMeshStatus) setConfigModelPublicationOnNode:(uint16_t )peerAddress elementAddress:(uint16_t)elementAddress publishAddress:(uint16_t)publishAddress appKeyIndex:(uint16_t)appKeyIndex credentialFlag:(BOOL)credentialFlag publishTTL:(uint8_t) publishTTL publishPeriod:(uint32_t)publishPeriod retransmitCount:(uint8_t)count retransmitInterval:(uint16_t)interval modelIdentifier:(uint32_t)modelIdentifier isVendorModelId:(BOOL)isVendorModelId;


/**
 * @brief addConfigAppKeyOnNode method. peerAddress , isEnableFriend two parameter required
 * @discussion This function is used to sends request for adding App Key to a node.
 * @param1 peerAddress Peer Address of Element.
 * @param2 appKeyIndex  index of selected App Key
 * @param3 netKeyIndex  index of selected Net Key
 * @code
    manager.getConfigurationModel().addConfigAppKeyOnNode(node.unicastAddress, appKeyIndex:0,netKeyIndex:0)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, elementAddress is datatype is uint16_t, appKeyIndex is uint16_t datatype, netKeyIndex is uint32_t datatype
 */
- (STMeshStatus) addConfigAppKeyOnNode:(uint16_t )peerAddress appKeyIndex:(uint16_t)appKeyIndex netKeyIndex:(uint16_t)netKeyIndex;

/**
 * @brief deleteConfigModelSubscriptionFromNode method. peerAddress ,elementAddress,groupAddress, modelIdentifier, isVendorModelId  Five parameter required
 * @discussion This function is used to sends request for removing subscription from an element of a node.
 * @param1 peerAddress Peer Address of Node
 * @param2 elementAddress Element Address of element
 * @param3 groupAddress Address of Selected Group
 * @param4 modelIdentifier Model Id of Selected Model
 * @param5 isVendorModelId Vandor Model Flage
 * @code
    manager.getConfigurationModel().deleteConfigModelSubscriptionFromNode(node.unicastAddress, elementAddress:element.unicastAddress,address:group.addess, modelIdentifier:model.ModelId,isVendorModelId:true)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, elementAddress is datatype is uint16_t, groupAddress is uint16_t datatype, modelIdentifier is uint32_t datatype, isVendorModelId is Bool datatype
 */
-(STMeshStatus) deleteConfigModelSubscriptionFromNode:(uint16_t )peerAddress elementAddress:(uint16_t)elementAddress group:(uint16_t)groupAddress modelIdentifier:(uint32_t)modelIdentifier isVendorModelId:(BOOL)isVendorModelId;

/**
 * @brief deleteConfigModelSubscriptionFromNode method. peerAddress ,elementAddress, modelIdentifier, isVendorModelId Four parameter required
 * @discussion This function is used to sends request for removing add subscription from an element of a node.
 * @param1 peerAddress Peer Address of Node
 * @param2 elementAddress Element Address of element
 * @param4 modelIdentifier Model Id of Selected Model
 * @param5 isVendorModelId Vandor Model Flage
 * @code
    manager.getConfigurationModel().ConfigSubscriptionDeleteAll(node.unicastAddress, elementAddress:element.unicastAddress, modelIdentifier:model.ModelId,isVendorModelId:true)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, elementAddress is datatype is uint16_t, modelIdentifier is uint32_t datatype, isVendorModelId is Bool datatype
 */
-(STMeshStatus)ConfigSubscriptionDeleteAll:(uint16_t)peerAddress elementAddress:(uint16_t)elementAddress modelIdentifier:(uint32_t)modelIdentifier isVendor:(BOOL)isVendorModelId;


/**
 * @brief setConfigNodeIdentity method. peerAddress, netKeyIndex, identity Three parameter required
 * @discussion This function is used to sends request for enabling / disabling proxy advertisement using node identity.
 * @param1 peerAddress Address of peer Node
 * @param2 netKeyIndex  Selected Net Key Index
 * @param3 identity  Idendity State
 * @code
    manager.getConfigurationModel().setConfigNodeIdentity(node.unicastAddress, netKeyIndex:0,identity:ConfigState_enabled)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, netKeyIndex is uint16_t datatype, identity is ConfigState enum  datatype,
 */
-(STMeshStatus)setConfigNodeIdentity:(uint16_t)peerAddress netKeyIndex:(uint16_t)netKeyIndex identity:(ConfigState)identity;


/**
 * @brief getConfigBeacon method. peerAddress one parameter required
 * @discussion This function is  used to request Config Beacon status data.
 * @param1 peerAddress Address of peer Node
 * @code
    manager.getConfigurationModel().getConfigBeacon(node.unicastAddress)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype.
 */
-(STMeshStatus)getConfigBeacon:(uint16_t)peerAddress;

/**
 * @brief setConfigBeacon method. peerAddress, isEnabled  two parameter required
 * @discussion This function is used to send set Config Beacon status data.
 * @param1 peerAddress Address of peer Node
 * @param2 isEnabled  Bool value of Beacon state
 * @code
    manager.getConfigurationModel().getConfigBeacon(node.unicastAddress, isEnable:true)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype., isEnable is Bool dataType
 */
-(STMeshStatus)setConfigBeacon:(uint16_t)peerAddress isEnable:(BOOL)isEnabled;


/**
 * @brief getConfigTTL method. peerAddress one parameter required
 * @discussion This function is  used to request Config TTL status data.
 * @param1 peerAddress Peer Address of Node
 * @code
    manager.getConfigurationModel().getConfigTTL(node.unicastAddress)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype.
 */
-(STMeshStatus)getConfigTTL:(uint16_t)peerAddress;

/**
 * @brief setConfigTTL method. peerAddress,ttlValue two parameter required
 * @discussion This function is  used to send set Config TTL status data.
 * @param1 peerAddress Peer Address of Node
 * @code
    manager.getConfigurationModel().setConfigTTL(node.unicastAddress,ttlValue:123)
 * @endcode
 * @return  Enum STMeshStatus corresponding value.
 * @remarks Parameters peerAddress is uint16_t datatype, ttlValue is uint16_t datatype.
 */
-(STMeshStatus)setConfigTTL:(uint16_t)peerAddress ttlValue:(uint16_t)ttlValue;



/* This method sends request for add Config Net key */
-(STMeshStatus)addConfigNetKey:(uint16_t)peerAddress netkeyIndex:(uint16_t)netKeyIndex;

/* This method sends request for update Config Net key */
-(STMeshStatus)updateConfigNetKey:(uint16_t)peerAddress netKeyIndex:(uint16_t)netkeyIndex;

/* This method sends request for delete Config Net key */
-(STMeshStatus)deleteConfigNetKey:(uint16_t)peerAddress netKeyIndex:(uint16_t)netKeyIndex;

/* This method is used to request Config net key status data. */
-(STMeshStatus)getConfigNetKey:(uint16_t)peerAddress;

/* This method sends request for update Config app key */
-(STMeshStatus)updateConfigAppKey:(uint16_t)peerAddress netKeyIndex:(uint16_t)netKeyIndex appkeyIndex:(uint16_t)appKeyIndex;

/* This method sends request for delete Config app key */
-(STMeshStatus)deleteConfigAppKey:(uint16_t)peerAddress netKeyIndex:(uint16_t)netKeyIndex appkeyIndex:(uint16_t)appKeyIndex;

/* This method is used to request Config app key status data. */
-(STMeshStatus)getConfigAppKey:(uint16_t)peerAddress  netKeyIndex:(uint16_t)netkeyIndex;

/* This method sends request for app bind */
-(STMeshStatus)configAppBind:(uint16_t)peerAddress elementAddress:(uint16_t)elementAddress appkeyIndex:(uint16_t)appKeyIndex modelIdentifier:(uint32_t)modelIdentifier isVendorModelId:(BOOL)isVendorModelId;

/* This method sends request for app unbind */
-(STMeshStatus)configAppUnbind:(uint16_t)peerAddress elementAddress:(uint16_t)elementAddress appkeyIndex:(uint16_t)appKeyIndex modelIdentifier:(uint32_t)modelIdentifier isVendorModelId:(BOOL)isVendorModelId;

/* This method is used to request Config Refresh phase status data. */
-(STMeshStatus)getConfigRefreshPhase:(uint16_t)peerAddress netKeyIndex:(uint16_t)netkeyIndex;

/* This method is used to set Config Refresh phase. */
-(STMeshStatus)setConfigRefreshPhase:(uint16_t)peerAddress netKeyIndex:(uint16_t)netKeyIndex transition:(uint8_t)transition;

/* This method is used to request network transmit status data. */
-(STMeshStatus)getNetworkTransmitGet:(uint16_t)peerAddress;

/* This method is used to set Config Refresh phase. */
-(STMeshStatus)setConfigNetworkTransmitSet:(uint16_t)peerAddress networkTransmitCount:(uint8_t)transmitCount networkTransmitIntervalSteps:(uint8_t)intervalSteps;

@end

@protocol STMeshConfigModelDelegate <NSObject>

@optional


/**
 * @brief  This is a callback Subscription Status of Config Model with configModel, configurationStatus, peerAddress, elementAdrress,modelIdentifier  Five Param required.
 * @discussion This callback is invoked when new subscription add or delete from the element.
 * @param1  configModel  object of Config model.
 * @param2 configurationStatus  configuration Status
 * @param2  peerAddress  Unicast address of the node.
 * @param3  elementAdrress  Unicast address of the Element.
 * @param4  modelIdentifier  model Identifier
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveSubscriptionStatus:(ConfigModelStatus)configurationStatus peerAddress:(uint16_t )peerAddress elementAddress:(uint16_t)elementAdrress modelIdentifier:(uint32_t)modelIdentifier;

@optional

/**
 * @brief  This is a callback publish Status of Config Model with configModel, configurationStatus, peerAddress, elementAdrress, publishAddress, appKeyIndex, credentialFlag, publishTTL, publishPeriod, count, interval, modelIdentifier  Tevel Param required.
 * @discussion This callback is invoked when publish status is received from the element.
 * @param1  configModel  object of Config model.
 * @param2  configurationStatus  configuration Status
 * @param3  peerAddress  Unicast address of the node.
 * @param4  elementAddress  Unicast address of the Element.
 * @param5  publishAddress  unicast Address of publisher
 * @param6  appKeyIndex   index of app Key
 * @param7  credentialFlag  Master Key Credential Flag.
 * @param8  publishTTL  Publish TTL
 * @param9  publishPeriod  Publishing time Period.
 * @param10  count  Retransmit Count
 * @param11  interval  Retransmit Interval
 * @param12  modelIdentifier  Model Identifier
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceivePublishStatus:(ConfigModelStatus)configurationStatus peerAddress:(uint16_t )peerAddress elementAddress:(uint16_t)elementAddress publishAddress:(uint16_t)publishAddress appKeyIndex:(uint16_t)appKeyIndex credentialFlag:(BOOL)credentialFlag publishTTL:(uint8_t) publishTTL publishPeriod:(uint32_t)publishPeriod retransmitCount:(uint8_t)count retransmitInterval:(uint16_t)interval modelIdentifier:(uint32_t)modelIdentifier;

@optional
/**
 * @brief  This is a callback AppKey Status of Config Model with configModel, configurationStatus, peerAddress, netKeyIndex, appKeyIndex  Five Param required.
 * @discussion This callback is invoked when AppKey status is received from the node. e.g. when new appKeyId add or appKey delete from the Node.
 * @param1  configModel  object of Config model.
 * @param2 configurationStatus  configuration Status
 * @param2  peerAddress  Unicast address of the node.
 * @param3  netKeyIndex  Netkey Index
 * @param4  appKeyIndex  AppKey Index
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveAppKeyStatus:(ConfigModelStatus)configurationStatus peerAddress:(uint16_t )peerAddress netKeyIndex:(uint16_t)netKeyIndex appkeyIndex:(uint16_t)appKeyIndex;

@optional

/**
 * @brief  This is a callback reset Status of Config Model with configModel, configurationStatus, peerAddress, Three Parameter required
 * @discussion This callback is invoked when reset status is received from the node. i.e. when node reset feature Sent from the node.
 * @param1  configModel  object of Config model.
 * @param2  configurationStatus  configuration Status
 * @param3  peerAddress  Unicast address of the node.
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveResetStatus:(STMeshStatus)configurationStatus peerAddress:(uint16_t)peerAddress;

@optional
/**
 * @brief  This is a callback composition data Status of Config Model with configModel, configurationStatus, peerAddress, pageNumber,data  Five Param required.
 * @discussion This callback is invoked when composition page 0 data is received from the node. i.e. when read composition data from the Node.
 * @param1  configModel  object of Config model.
 * @param2 configurationStatus  configuration Status
 * @param2  peerAddress  Unicast address of the node.
 * @param3  pageNumber  page Number
 * @param4  data  received Composition data
 */

- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveCompositionData:(STMeshStatus)configurationStatus peerAddress:(uint16_t)peerAddress pageNumber:(uint8_t)pageNumber ReceivedData:(STMeshCompositionDataModel*)data;

@optional
/**
 * @brief  This is a callback friend feature Status of Config Model with configModel, peerAddress, friendState, Three Parameter required
 * @discussion This callback is invoked when friend feature status is received from the node. i.e. when read friend feature or friend feature Set from the node.
 * @param1  configModel  object of Config model.
 * @param2  peerAddress  Unicast address of the node.
 * @param3  friendState  friend status Enum
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveFriendStatus:(uint16_t)peerAddress friendStatus:(ConfigState)friendState;

@optional
/**
 * @brief  This is a callback proxy feature Status of Config Model with configModel, peerAddress, proxyState, Three Parameter required
 * @discussion This callback is invoked when proxy feature status is received from the node. i.e. when read proxy feature or proxy feature Set from the node.
 * @param1  configModel  object of Config model.
 * @param2  peerAddress  Unicast address of the node.
 * @param3  proxyState  proxy status Enum
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveProxyStatus:(uint16_t)peerAddress proxy:(ConfigState)proxyState;

@optional
/**
 * @brief  This is a callback  relay feature Status of Config Model with configModel, peerAddress, relay,retransmitCount,interval  Five Param required.
 * @discussion This callback is invoked when relay feature status is received from the node. i.e. when read relay feature add or set  relay feature is called on the node.
 * @param1  configModel  object of Config model.
 * @param2  peerAddress  Unicast address of the node.
 * @param3  relay  realy status Enum
 * @param4  retransmitCount  Retranmit Count
 * @param5  interval  Retranmit Time interval
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveConfigRelayStatus:(uint16_t)peerAddress relay:(ConfigState)relay retransmitCount:(uint8_t)retransmitCount retransmitInterval:(uint16_t)interval;

@optional
/**
 * @brief  This is a callback NodeIdentity Status of Config Model with configModel, peerAddress, indentity, Three Parameter required
 * @discussion This callback is invoked when NodeIdentity status is received from the node. i.e. when Node Identity Set from the node.
 * @param1  configModel  object of Config model.
 * @param2  peerAddress  Unicast address of the node.
 * @param3  indentity  node Identity
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveConfigNodeIdentityStatus:(uint16_t)peerAddress indentity:(ConfigState)indentity;


@optional
/**
 * @brief  This is a callback Beacon Status of Config Model with configModel, peerAddress, status, Three Parameter required
 * @discussion This callback is invoked when Beacon status is received from the node. i.e. when read Beacon value or Beacon Set called on the node.
 * @param1  configModel  object of Config model.
 * @param2  peerAddress  Unicast address of the node.
 * @param3  status  config status
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveConfigBeaconStatus:(uint16_t)peerAddress status:(ConfigState)status;

@optional
/**
 * @brief  This is a callback TTL Status of Config Model with configModel, peerAddress, status, Three Parameter required
 * @discussion This callback is invoked when TTL status is received from the node. i.e. when read TTL value or TTL value Set called on the node.
 * @param1  configModel  object of Config model.
 * @param2  peerAddress  Unicast address of the node.
 * @param3  status  config status
 */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveConfigTTLStatus:(uint16_t)peerAddress status:(ConfigState)status;




@optional
/* This callback is invoked when NetKey status is received from the node. */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveConfigNetKeyStatus:(uint16_t)peerAddress status:(ConfigState)status netKeyIndex:(uint16_t)netKeyIndex;

@optional
/* This callback is invoked when App Key Bind status is received from the node. */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveConfigAppKeyBindStatus:(uint16_t)peerAddress  elementAdress:(uint16_t)elementAdreess status:(ConfigModelStatus)status appKeyIndex:(uint16_t)appKeyIndex modelId:(uint32_t)modelIdentifier;

@optional
/* This callback is invoked when Refresh Phase status is received from the node. */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveConfigKeyRefreshPhaseStatus:(uint16_t)peerAddress status:(ConfigState)status netKeyIndex:(uint16_t)netKeyIndex phase:(uint8_t)phase;

@optional
/* This callback is invoked when Network Transmit status is received from the node. */
- (void) meshConfigModel:(STMeshConfigurationModel *)configModel didReceiveNetworkTransmitStatus:(uint16_t)peerAddress networkTransmitCount: (uint8_t) transmitCount  networkTransmitIntervalSteps:(uint8_t)IntervalSteps;

@end
