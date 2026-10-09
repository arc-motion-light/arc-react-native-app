/**
 ******************************************************************************
 * @file    STMeshTypes.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    30-Jun-2017
 * @brief   Common types used in the library
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

#ifndef STMeshTypes_h
#define STMeshTypes_h

#import <Foundation/Foundation.h>
#include "STMeshBasicTypes.h"

#define STMesh_Provisioner_AddressLowRange_Key "lowAddress"
#define STMesh_Provisioner_AddressHighRange_Key "highAddress"


@class STMeshNode;
@class STMeshElement;
@class STMeshProvisionerData;
@class STMeshModel;
@class ProvisioningRangeObjects;
@class STMeshNodeFeatures;
@class STMeshSensorValues;
@class STMeshHeartbeat;
@class STMeshSensorData;
@class STMeshKey;
@class STMeshNodeKey;
@class STMeshPublish;
@class STMeshSensorDescriptorData;
@class STMeshScene;

@class STMeshKey ;


@protocol STMeshkeysProtocol <NSObject>


@property(nonatomic, readonly)NSInteger count;
-(STMeshKeysOperationState)appendKey:(STMeshKey * _Nonnull)key;
-(STMeshKeysOperationState)appendKeys:(NSArray<STMeshKey *> * _Nonnull)keys;

-(STMeshKey * _Nullable)keyAtIndex:(uint16_t)keyIndex;
-(NSArray<STMeshKey *> * _Nonnull)keys;
-(STMeshKeysOperationState)deleteKeyAtIndex:(uint16_t)KeyIndex;
-(STMeshKeysOperationState)removeKey:(STMeshKey * _Nonnull)key;

@end


@interface STMeshKey : NSObject

@property(nonatomic, readonly,nonnull) NSString *key;
@property(nonatomic, readonly) uint16_t index;
@property(atomic, readwrite,nonnull)NSString *name;

-(instancetype _Nonnull)initWithKey:(NSString * _Nonnull)key Index:(uint16_t)index  Name:(NSString * _Nonnull)name;
@end 


@interface STMeshNetKey :STMeshKey
@property(nonatomic, readonly, nullable)NSString *oldKey;
@property(nonatomic, readonly, nullable)uint8_t *phase;
@property(nonatomic, readonly, nullable)NSString *minSecurity;


+(instancetype _Nonnull)initWithKey:(NSString * _Nonnull)key Index:(uint16_t)index  Name:(NSString * _Nonnull)name oldKey:(NSString * _Nullable)oldKey Phase:(NSUInteger)phase minSecurity:(NSString * _Nullable)minSecurity;
@end

@interface STMeshAppKey:STMeshKey
@property(nonatomic, readonly)uint16_t boundNetkey;


+(instancetype _Nonnull)initWithKey:(NSString * _Nonnull)key Index:(uint16_t)index  Name:(NSString * _Nonnull)name BoundNetKey:(NSInteger)boundNetKey;

@end

@interface STMeshDevicesKey :STMeshKey
@end

@interface STMeshNetkeys<STMeshNetKey> : NSObject<STMeshkeysProtocol>
-(NSString *_Nullable)getOldNetKeyAtIndex:(uint16_t)keyIndex;
-(NSString *_Nullable)getMinSecurityForNetKeyAtIndex:(uint16_t)keyIndex;
-(uint8_t)getkeyRefreshPhaseForNetkeyAtIndex:(uint8_t)keyIndex;


@end



@interface STMeshAppKeys<STMeshAppKey>:NSObject<STMeshkeysProtocol>


@end

@interface STMeshGroup:NSObject
@property (nonatomic, nonnull) NSString *  groupName;
@property (nonatomic) uint16_t groupAddress;
@property (nonatomic) BOOL switchState;
@property (nonatomic, nonnull) NSMutableArray<STMeshModel*> *subscribersElem;

@end

@interface STMeshScene:NSObject
@property (nonatomic, nonnull) NSString *  sceneName;
@property (nonatomic, nonnull) NSString * sceneNumber;
@property (nonatomic, nonnull) NSMutableArray<NSNumber*> *sceneAddresses;

@end
/**
 * @discussion Mesh Node class and its associated properties
 * @code
 - node Properties
 ** nodeName : Represents the name of the node.
 ** nodeUUID : Represents the UUID of the node.
 ** deviceKey : Represents the device Key of the node.
 ** isProxyNode : Bool to indicate a node is proxy or not
 ** publishTarget : Publish address associated with node.
 ** unicastAddress : Address allocated to the node.
 ** configCompleted :Bool representing node configuration status.
 ** blackListed : Bool representing node blackListed Status.
 ** cid : Company Identifier of a node.
 ** pid : Product Identifier of a node.
 ** vid : Version Identifier of a node.
 ** crpl : Replay protection list size of a node.
 ** features : Features associated with a node. Ex isProxyFeature is supported by node , isLowPowerSupport is supported by node.
 ** elementList : List of all elements associated with a node.
 ** subscribedGroups : List of all subscribed groups.
 *@endcode
 */
@interface STMeshNode:NSObject
@property (nonatomic, nonnull) NSString *nodeName;
@property (nonatomic, nonnull) NSString *nodeUUID;
@property (nonatomic, nonnull) NSString *deviceKey;
@property (nonatomic) BOOL isProxyNode;
@property (nonatomic) BOOL switchState;
@property (nonatomic) uint16_t publishAddress;
@property (nonatomic) uint16_t unicastAddress;
@property (nonatomic, nonnull) id publishTarget;
@property (nonatomic) BOOL configComplete;
@property (nonatomic) BOOL blacklisted;
@property (nonatomic, nullable) NSString * cid;
@property (nonatomic, nullable) NSString * pid ;
@property (nonatomic, nullable) NSString * vid;
@property (nonatomic, nullable) NSString * crpl;
@property (nonatomic, nullable) STMeshNodeFeatures * features;
@property (atomic, nonnull) NSMutableArray<STMeshElement *> *elementList;
@property (atomic, nonnull) NSMutableArray<STMeshElement*> *subscribedGroups;
@property (nonatomic, nullable) STMeshHeartbeat *heartbeatInfo;

@property (nonatomic, nonnull) NSMutableArray<STMeshNodeKey*> *netkeys;
@property (nonatomic, nonnull) NSMutableArray<STMeshNodeKey*> *appKeys;
@end



/**
 * @discussion Mesh Element class and its associated properties
 * @code
 - node Properties
 ** name : Represents the name of the element.
 ** publishTarget : Publish address associated with element.
 ** unicastAddress : Address allocated to the element.
 ** modelList : List of all models associated with a node.
 ** configCompleted :Bool representing node configuration status.
 ** subscribedGroups : List of all subscribed groups.
 ** parentNode : Represents the immediate parent node of the element.
 *@endcode
 */
@interface STMeshElement : NSObject
@property (nonatomic) uint8_t index;
@property (nonatomic, nullable) NSString *elementName;
@property (nonatomic,strong, nullable) id  publishTarget;
@property (nonatomic) uint16_t unicastAddress;
@property (nonatomic, nonnull) NSMutableArray<STMeshModel*> *modelList;
@property (nonatomic) BOOL configComplete;
@property (nonatomic, nonnull) NSMutableArray<STMeshGroup*> *subscribedGroups;
@property (nonatomic, weak, nullable) STMeshNode * parentNode;
@property (nonatomic, nonnull) STMeshSensorValues *sensorModel;

@end

@interface ProvisioningRangeObjects : NSMutableDictionary

-(id _Nullable )initRangeObjectsWithMinValue:(NSString* _Nonnull)lowRange maxValue:(NSString* _Nonnull)highRange;

@end

/**
 * @discussion Mesh Provisioner Data class and its associated properties
 * @code
 - node Properties
 ** provisionerName : Represents the name of the Provisioner.
 ** provisionerUUID :: Represents the UUID of the provisioner.
 ** marrProvisionerAllocatedUnicastRange : Allocated unicast range to the provisioner for assigning unicast address to the nodes/elements
 ** marrProvisionerAllocatedGroupRange : Allocated group range to the provisioner for assigning unicast address to the nodes/elements
 *@endcode
 */
@interface STMeshProvisionerData : STMeshNode
@property (nonatomic, nonnull) NSString *  provisionerName;
@property (nonatomic, nonnull) NSString * provisionerUUID;
@property (nonatomic, nonnull) NSMutableArray<ProvisioningRangeObjects*> *marrProvisionerAllocatedUnicastRange;
@property (nonatomic, nonnull) NSMutableArray<ProvisioningRangeObjects*> *marrProvisionerAllocatedGroupRange;
@end

/**
 * @discussion Mesh Network Setting class and its associated properties
 * @code
 - node Properties
 ** iVindex : Represents the iVindex of the network.
 ** netKey :: Represents the network Key of the network.
 ** appKey :: Represents the application Key of the network.
 ** devKey :: Represents the device Key of the network.
 ** meshName :: Represents the mesh name of the network.
 ** meshUUID :: Represents the mesh UUID of the network.
 ** nodes : Array of all nodes in the network.
 ** groups : Array of all groups in the network.
 
 * + (instancetype) initAsNewNetwork : A class method to instantiate the network
 *@endcode
 */
@interface STMeshNetworkSettings : NSObject

@property (atomic) uint32_t iVindex;
//@property (nonatomic,nonnull) NSString *netKey;
//@property (nonatomic, nonnull) NSString *appKey;
//@property (nonatomic, nonnull) NSString *devKey;
@property (nonatomic, nonnull) NSString *meshName;
@property (nonatomic, nonnull) NSString *meshUUID;

@property(nonatomic, nonnull)STMeshNetkeys * netKeys;
@property(nonatomic, nonnull)STMeshAppKeys * appkeys;

@property BOOL useDefaultSecuritiesCredential;
@property (nonatomic, nonnull) NSMutableArray<STMeshNode*> *nodes;
@property (nonatomic, nonnull) NSMutableArray<STMeshGroup*> *groups;
@property (nonatomic, nonnull) NSMutableArray<STMeshScene*> *scenes;

@property (nonatomic, nonnull) NSMutableArray<STMeshProvisionerData*> *provisionerDataArray;
@property (nonatomic, nonnull) NSMutableArray<STMeshProvisionerData*> *onlyProvisionerArray;

+ (instancetype _Nonnull ) initAsNewNetwork;
- (void)reinitNetworkDataList;

-(STMeshKey * _Nullable)getAppKeyWithIndex:(uint16_t)appKeyIndex;
-(void)setAppKeyOnIndex:(uint16_t)appkeyIndex appkey:(STMeshKey *_Nullable)appKey;

-(STMeshElement * _Nullable)getElementWith:(uint16_t)unicastAddress;
-(void)setElementOnelementAddress:(uint16_t)unicastAddress element:(STMeshElement * _Nonnull)element;
-(STMeshGroup *_Nullable)getGroupWithGroupAddress:(uint16_t)groupAddress;
-(void)setGroupOnAddress:(uint16_t)address group:(STMeshGroup *_Nonnull)group;


//-(NSMutableArray<STMeshKey *>* _Nonnull)getAppkeys;
//-(STMeshKey * _Nullable)getAppKeysAtIndex:(NSInteger)index;
//
//-(void)assignAppKeys:(NSMutableArray<STMeshKey *>* _Nonnull)appKeys;
//-(void)addAppkeyObject:(STMeshKey * _Nonnull)appKey;
//
//-(NSMutableArray<STMeshKey *>* _Nonnull)getNetKeys;
//-(STMeshKey * _Nullable)getNetkeysAtIndex:(NSInteger)index;
//-(void)assignNetkeys:(NSMutableArray<STMeshKey *>*_Nonnull)netkeys;
//-(void)addNetkeyObject:(STMeshKey *_Nonnull)netkey;
//


@end

/**
 * @discussion Mesh Model class and its associated properties
 * @code
 - node Properties
 ** modelId : Represents the model Id of the model.
 ** modelName :: Represents the model name of the model.
 ** subscribedList : List of all subscribed groups.
 ** publishTarget : Publish address associated with Model.
 *@endcode
 */
@interface STMeshModel: NSObject
@property (nonatomic) uint32_t modelId;
@property (nonatomic, nonnull) NSString * modelName;
@property (nonatomic, nonnull) NSMutableArray<STMeshGroup*> * subscribeList;
@property (nonatomic, nullable) STMeshPublish * publish;
@property (nonatomic,weak, nullable)STMeshElement * parentElement;
@property (nonatomic, nonnull) NSMutableArray<STMeshNodeKey *> *bind;
@property(nonatomic) BOOL isVendorModel;


@end

//@interface STMeshKey : NSObject
//@property(nonatomic, nonnull) NSString *name;
//@property(nonatomic) uint16_t index;
//@property(nonatomic, nonnull) NSString *key;
//@property(nonatomic, nonnull) NSNumber * boundNetKey;
//
//-(instancetype _Nonnull )init :(NSString *_Nonnull)key name:(NSString *_Nonnull) name index:(uint16_t)index;
//@end



@interface STMeshPublish : NSObject
@property (nonatomic) uint16_t address;
@property (nonatomic) uint16_t index;
@property (nonatomic) uint8_t ttlValue;
@property (nonatomic) uint32_t period;
@property (nonatomic) uint8_t retransmitCount;
@property (nonatomic) uint16_t retransmitInterval;

-(instancetype _Nonnull )init :(uint16_t) address index:(uint16_t)index ttl:(uint8_t)ttlValue period:(uint32_t)period count:(uint8_t)retransmitCount Interval:(uint16_t)retransmitInterval;
@end

@interface STMeshNodeKey:NSObject

@property(nonatomic) UInt16 index;
@property(atomic) BOOL updated;
@property(atomic, assign)BOOL isDefaultAppkey;
-(instancetype _Nonnull )init :(BOOL) updated index:(uint16_t)index ;
@end

/**
 * @discussion Mesh Node Feature class and its associated properties
 * @code
 ** relay : Represents, if node supports relay feature.
 ** proxy : Represents, if node supports proxy feature.
 ** friend : Represents, if node supports friend feature.
 ** lowPower : Represents, if node supports low power feature.
 *@endcode
 */
@interface STMeshNodeFeatures :NSObject
@property (nonatomic) uint8_t relay;
@property (nonatomic) uint8_t proxy;
@property (nonatomic) uint8_t friendFeature;
@property (nonatomic) uint8_t lowPower;

@end

/**
 * @discussion Sensor Value Data Model class and its associated properties
 * @code
 ** sensorTemperatureValue : Represents, Temperature Sensor Value associated with the node.
 ** sensorPressureValue : Represents, Pressure Sensor Value associated with the node.
 *@endcode
 */
@interface STMeshSensorValues :NSObject
@property (nonatomic, nullable) NSString * sensorTemperatureValue;
@property (nonatomic, nullable) NSString * sensorPressureValue;
@property (nonatomic, nullable) NSString * sensorHumidityValue;
@property (nonatomic, nullable) NSString * sensorAccelerometerValue;
@property (nonatomic, nullable) NSString * sensorMagnometerValue;
@property (nonatomic, nullable) NSString * sensorGyrometerValue;
@property (nonatomic, nonnull) NSMutableArray * marrAllSensorValue;
@property (nonatomic, nullable) NSMutableDictionary *mdictPIDKeyAndSensorValue;


@end


/**
 * @discussion Heartbeat Value Data Model class and its associated properties
 * @code
 ** strLastHeartbeatRecieved : Represents, Last heartbeat recieved time.
 ** maxHops : Represents, Maximum Hops required to reach destination.
 ** minHops : Represents, Minimum Hops required to reach destination.
 
 *@endcode
 */
@interface STMeshHeartbeat : NSObject
@property(nonatomic, nullable) STMeshNodeFeatures *nodeFeatures;
@property(nonatomic, nullable) NSString *strLastHeartbeatRecieved;
@property(nonatomic, nullable) NSString *maxHops;
@property(nonatomic, nullable) NSString *minHops;
@end


/**
 * @discussion Sensor Data Model class and its associated properties
 * @code
 ** timestanmp : Represents, Last sensor data recieved time.
 ** propertyID : Represents, Property ID required of the sensor.
 ** sensorName : Represents, name of the sensor model. i.e Temperature , pressure etc.
 ** sensorValue : Represents, actual value of the sensor.
 ** sensorFormatType : Represents, type of the fornat used to transfer the data, ex either FormatA or FornatB
 *@endcode
 */
@interface STMeshSensorData : NSObject
@property (nonatomic) NSTimeInterval timestanmp;
@property (nonatomic) int propertyID;
@property (nonatomic, nullable) NSString *  sensorName;
@property (nonatomic, nonnull) NSString * stringUnit;
@property (nonatomic, nonnull) NSString* sensorValue;
@property (nonatomic, nonnull) NSString *sensorFormatType;

@end


@interface STMeshSensorDescriptorData : NSObject
@property (nonatomic) int sensorPropertyID ;
@property (nonatomic) int sensorPositiveTolerance ;
@property (nonatomic) int sensorNegativeTolerance ;
@property (nonatomic) int sensorSamplingFunction ;
@property (nonatomic) int sensorMeasurementPeriod ;
@property (nonatomic) int sensorUpdateInterval ;
@end

















#endif /* STMeshTypes_h */





