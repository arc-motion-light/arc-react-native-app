/**
 ******************************************************************************
 * @file    STMeshSensorModel.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    28-September-2018
 * @brief   Implementation of Sensor model.
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


@protocol STMeshSensorModelDelegate;
@interface STMeshSensorModel : NSObject

/**
 * @brief  Read sensor data from sensors with specified Id.
 * @discussion Read sensor data from sensors with specified Id.
 * @param1  peerAddress Element address from which the data is requested.
 * @param2  propertyID Property Id of the sensor to read data from.
 * @return Result of the method execution.
 */
-(STMeshStatus)sensorModelGetSensorsWithPropertyIDForPeer:(uint16_t)peerAddress propertyID:(uint16_t)propertyID;
/**
 * @brief  Read sensor data from all sensors.
 * @discussion Read sensor data from all sensors.
 * @param1  peerAddress Element address from which the data is requested.
 * @return Result of the method execution.
 */
-(STMeshStatus)SensorModelGetSensorsWithoutPropertyID:(uint16_t)peerAddress;


/**
 * @brief  Sensor Model Get Descriptor for each element.
 * @discussion Get Descriptor for each element. i.e sensor propertyID, Sensor Update Interval etc of an element
 * @param1  peerAddress Element address from which the data is requested.
 * @param2  propertyID Property Id of the sensor to read data from.
 * @return Result of the method execution.
 */
-(STMeshStatus)SensorModelGetSensorDescriptor:(uint16_t)peerAddress propertyID:(uint16_t)propertyID;

/**
 * @brief  Sensor Model Get Descriptor for each element.
 * @discussion Get Descriptor for each element. i.e sensor propertyID, ssensor update interval etc of an element
 * @param1  peerAddress Element address from which the data is requested.
 * @return Result of the method execution.
 */
-(STMeshStatus)SensorModelGetSensorDescriptorWithOutPropertyID:(uint16_t)peerAddress;


@property(weak , nonatomic) id<STMeshSensorModelDelegate> delegate;
@end


@protocol STMeshSensorModelDelegate <NSObject>

/**
 * @brief  This callback is invoked when sensor data is received.
 * @discussion The method is invoked on receiving solicited or un-solicited sensor data.
 * @param1  peerAddress Element address from which the data is received.
 * @param2  sensorData  Data Array containing the data received from the sensor(s).
 */
- (void) SensorModel:(STMeshSensorModel*)SensorModel didReceiveSensorStatusFromAddressWithData:(uint16_t)peerAddress sensorData:(NSMutableArray*)sensorData;


/**
 * @brief  This callback is invoked when Sensor Descriptor Data is received.
 * @discussion The method is invoked on receiving solicited or un-solicited sensor descriptor data.
 * @param1  peerAddress Element address from which the data is received.
 * @param2  sensorDescriptorData Data Array containing the descriptor data received from the sensor(s).
 */
-(void) SensorModel:(STMeshSensorModel*)sensorModel didReceiveSensorDescriptorDataFromAddressWithData:(uint16_t)peerAddress sensorDescriptorData:(NSMutableArray*)sensorDescriptorData;



@end

